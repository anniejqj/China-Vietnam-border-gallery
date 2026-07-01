/**
 * Interactive 3D Globe — Social Science Gallery
 * Accurate continent and country outlines (Natural Earth 110m data)
 * with Morandi-style color fills and auto/manual rotation.
 */
(function() {
    const STUDY_AREA = { lat: 21.55, lng: 107.97, name: 'Dongxing\u2013M\u00f3ng C\u00e1i' };
    const DATA_URL = 'data/world.json';

    let scene, camera, renderer, globe, markerGroup;
    let isUserInteracting = false;
    let targetRotX = 0, targetRotY = 0;
    let mouseX0 = 0, mouseY0 = 0;
    let autoRotate = true;
    let resumeTimer = null;

    const container = document.getElementById('globe-canvas');
    if (!container) return;

    initScene();
    loadWorldData().then(buildGlobe).catch(function(err) {
        console.error('Failed to load world data:', err);
    });

    function initScene() {
        var w = container.clientWidth, h = container.clientHeight;
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
        camera.position.z = 3.2;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xffffff, 0.95));

        globe = new THREE.Group();
        scene.add(globe);

        createBaseSphere();
        createGraticule();
        createAtmosphere();
        createStars();
        createMarker();

        // Initial rotation toward study area
        var phi = (90 - STUDY_AREA.lat) * Math.PI / 180;
        var theta = (STUDY_AREA.lng + 180) * Math.PI / 180;
        targetRotX = -(theta - Math.PI);
        targetRotY = -(phi - Math.PI / 2) * 0.25;

        container.addEventListener('mousedown', onDown);
        container.addEventListener('mousemove', onMove);
        container.addEventListener('mouseup', onUp);
        container.addEventListener('mouseleave', onUp);
        container.addEventListener('wheel', onWheel, { passive: false });
        container.addEventListener('touchstart', onTouchStart, { passive: false });
        container.addEventListener('touchmove', onTouchMove, { passive: false });
        container.addEventListener('touchend', onUp);
        window.addEventListener('resize', onResize);

        animate();
    }

    function loadWorldData() {
        return fetch(DATA_URL).then(function(r) { return r.json(); });
    }

    function buildGlobe(data) {
        // Continent fills (Morandi palette)
        for (var contName in data.continents) {
            if (!data.continents.hasOwnProperty(contName)) continue;
            var cont = data.continents[contName];
            addContinentFill(contName, cont.color, cont.polygons);
        }

        // Country outlines
        var outlinePositions = [];
        for (var i = 0; i < data.countryOutlines.length; i++) {
            var country = data.countryOutlines[i];
            appendPolygonLines(country.coords, country.type, outlinePositions, 1.004);
        }
        if (outlinePositions.length > 0) {
            var outlineGeo = new THREE.BufferGeometry();
            outlineGeo.setAttribute('position', new THREE.Float32BufferAttribute(outlinePositions, 3));
            var outlineMat = new THREE.LineBasicMaterial({ color: 0x2a2a2a, transparent: true, opacity: 0.45 });
            globe.add(new THREE.LineSegments(outlineGeo, outlineMat));
        }

        // Continent labels
        for (var contName2 in data.continents) {
            if (!data.continents.hasOwnProperty(contName2)) continue;
            var cont2 = data.continents[contName2];
            var centroid = computeCentroid(cont2.polygons);
            if (centroid) {
                var label = makeLabel(contName2);
                label.position.copy(ll2v(centroid.lat, centroid.lng, 1.08));
                globe.add(label);
            }
        }
    }

    function addContinentFill(name, color, polygons) {
        var positions = [];
        for (var i = 0; i < polygons.length; i++) {
            var poly = polygons[i];
            if (poly.type === 'Polygon') {
                triangulateRing(poly.coords[0], positions, 1.0015);
            } else if (poly.type === 'MultiPolygon') {
                for (var j = 0; j < poly.coords.length; j++) {
                    triangulateRing(poly.coords[j][0], positions, 1.0015);
                }
            }
        }
        if (positions.length === 0) return;
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geo.computeVertexNormals();
        var mat = new THREE.MeshLambertMaterial({
            color: new THREE.Color(color),
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide
        });
        var mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'continent-fill-' + name;
        globe.add(mesh);
    }

    function triangulateRing(ring, positions, radius) {
        if (ring.length < 3) return;
        // Compute centroid on sphere
        var cx = 0, cy = 0, cz = 0;
        for (var i = 0; i < ring.length; i++) {
            var v = ll2v(ring[i][1], ring[i][0], radius);
            cx += v.x; cy += v.y; cz += v.z;
        }
        var c = new THREE.Vector3(cx, cy, cz).normalize().multiplyScalar(radius);
        for (var j = 0; j < ring.length - 1; j++) {
            var a = ll2v(ring[j][1], ring[j][0], radius);
            var b = ll2v(ring[j + 1][1], ring[j + 1][0], radius);
            positions.push(c.x, c.y, c.z, a.x, a.y, a.z, b.x, b.y, b.z);
        }
    }

    function appendPolygonLines(coords, type, arr, radius) {
        var polys = type === 'Polygon' ? [coords] : coords;
        for (var p = 0; p < polys.length; p++) {
            var rings = polys[p];
            for (var r = 0; r < rings.length; r++) {
                var ring = rings[r];
                for (var i = 0; i < ring.length - 1; i++) {
                    var a = ll2v(ring[i][1], ring[i][0], radius);
                    var b = ll2v(ring[i + 1][1], ring[i + 1][0], radius);
                    arr.push(a.x, a.y, a.z, b.x, b.y, b.z);
                }
            }
        }
    }

    function computeCentroid(polygons) {
        var sumLat = 0, sumLng = 0, count = 0;
        for (var i = 0; i < polygons.length; i++) {
            var poly = polygons[i];
            var rings = poly.type === 'Polygon' ? poly.coords : poly.coords[0];
            for (var j = 0; j < rings[0].length; j++) {
                sumLng += rings[0][j][0];
                sumLat += rings[0][j][1];
                count++;
            }
        }
        if (count === 0) return null;
        return { lat: sumLat / count, lng: sumLng / count };
    }

    function createBaseSphere() {
        var geo = new THREE.SphereGeometry(0.998, 64, 64);
        var mat = new THREE.MeshPhongMaterial({
            color: 0x1c2e3e,
            specular: 0x111111,
            shininess: 5
        });
        globe.add(new THREE.Mesh(geo, mat));
    }

    function createGraticule() {
        var g = new THREE.Group();
        var r = 1.0005;
        var lineMat = new THREE.LineBasicMaterial({ color: 0x4a7a9a, transparent: true, opacity: 0.18 });
        var eqMat = new THREE.LineBasicMaterial({ color: 0xd4a574, transparent: true, opacity: 0.35 });

        for (var lat = -75; lat <= 75; lat += 15) {
            var pts = [];
            for (var lng = -180; lng <= 180; lng += 3) pts.push(ll2v(lat, lng, r));
            g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lat === 0 ? eqMat : lineMat));
        }
        for (var lng2 = -180; lng2 < 180; lng2 += 15) {
            var pts2 = [];
            for (var lat2 = -90; lat2 <= 90; lat2 += 3) pts2.push(ll2v(lat2, lng2, r));
            g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), lng2 === 0 ? eqMat : lineMat));
        }
        globe.add(g);
    }

    function createMarker() {
        markerGroup = new THREE.Group();
        var pos = ll2v(STUDY_AREA.lat, STUDY_AREA.lng, 1.012);

        var pin = new THREE.Mesh(
            new THREE.SphereGeometry(0.018, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffb347 })
        );
        pin.position.copy(pos);
        markerGroup.add(pin);

        var ring1 = new THREE.Mesh(
            new THREE.RingGeometry(0.024, 0.034, 32),
            new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
        );
        ring1.position.copy(pos);
        ring1.lookAt(new THREE.Vector3(0, 0, 0));
        markerGroup.add(ring1);

        var ring2 = new THREE.Mesh(
            new THREE.RingGeometry(0.040, 0.050, 32),
            new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
        );
        ring2.position.copy(pos);
        ring2.lookAt(new THREE.Vector3(0, 0, 0));
        ring2.userData.isPulse = true;
        markerGroup.add(ring2);

        var label = makeLabel(STUDY_AREA.name);
        label.position.copy(pos.clone().multiplyScalar(1.09));
        label.scale.set(0.32, 0.08, 1);
        markerGroup.add(label);

        globe.add(markerGroup);
    }

    function createAtmosphere() {
        var geo = new THREE.SphereGeometry(1.12, 64, 64);
        var mat = new THREE.ShaderMaterial({
            vertexShader: 'varying vec3 vN; void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
            fragmentShader: 'varying vec3 vN; void main(){float i=pow(0.65-dot(vN,vec3(0,0,1.0)),2.5);gl_FragColor=vec4(0.25,0.55,0.85,1.0)*i*0.35;}',
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            transparent: true
        });
        scene.add(new THREE.Mesh(geo, mat));
    }

    function createStars() {
        var geo = new THREE.BufferGeometry();
        var pos = [];
        for (var i = 0; i < 1800; i++) {
            var r = 40 + Math.random() * 30;
            var t = Math.random() * Math.PI * 2;
            var p = Math.acos(2 * Math.random() - 1);
            pos.push(r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p));
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.55 })));
    }

    function ll2v(lat, lng, r) {
        var phi = (90 - lat) * Math.PI / 180;
        var theta = (lng + 180) * Math.PI / 180;
        return new THREE.Vector3(
            -(r * Math.sin(phi) * Math.cos(theta)),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        );
    }

    function makeLabel(text) {
        var canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        var ctx = canvas.getContext('2d');
        ctx.font = '600 40px "Source Sans Pro", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillText(text, 257, 66);
        ctx.fillStyle = 'rgba(240,230,200,0.85)';
        ctx.fillText(text, 256, 64);
        var tex = new THREE.CanvasTexture(canvas);
        var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        var sp = new THREE.Sprite(mat);
        sp.scale.set(0.38, 0.095, 1);
        return sp;
    }

    function pauseAuto() { autoRotate = false; if (resumeTimer) clearTimeout(resumeTimer); }
    function scheduleResume() { if (resumeTimer) clearTimeout(resumeTimer); resumeTimer = setTimeout(function() { autoRotate = true; }, 2000); }

    function onDown(e) { isUserInteracting = true; pauseAuto(); mouseX0 = e.clientX; mouseY0 = e.clientY; }
    function onMove(e) {
        if (!isUserInteracting) return;
        targetRotX += (e.clientX - mouseX0) * 0.005;
        targetRotY += (e.clientY - mouseY0) * 0.003;
        targetRotY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, targetRotY));
        mouseX0 = e.clientX; mouseY0 = e.clientY;
    }
    function onUp() { isUserInteracting = false; scheduleResume(); }
    function onTouchStart(e) { if (e.touches.length === 1) { isUserInteracting = true; pauseAuto(); mouseX0 = e.touches[0].clientX; mouseY0 = e.touches[0].clientY; } }
    function onTouchMove(e) {
        if (!isUserInteracting || e.touches.length !== 1) return;
        e.preventDefault();
        targetRotX += (e.touches[0].clientX - mouseX0) * 0.005;
        targetRotY += (e.touches[0].clientY - mouseY0) * 0.003;
        targetRotY = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, targetRotY));
        mouseX0 = e.touches[0].clientX; mouseY0 = e.touches[0].clientY;
    }
    function onWheel(e) { e.preventDefault(); camera.position.z = Math.max(1.8, Math.min(5, camera.position.z + e.deltaY * 0.002)); }
    function onResize() { var w = container.clientWidth, h = container.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h); }

    function animate() {
        requestAnimationFrame(animate);
        if (autoRotate && !isUserInteracting) targetRotX += 0.001;
        globe.rotation.y += (targetRotX - globe.rotation.y) * 0.05;
        globe.rotation.x += (targetRotY - globe.rotation.x) * 0.05;

        if (markerGroup) {
            var t = Date.now() * 0.003;
            for (var i = 0; i < markerGroup.children.length; i++) {
                var c = markerGroup.children[i];
                if (c.userData && c.userData.isPulse) {
                    var s = 1 + Math.sin(t) * 0.35;
                    c.scale.set(s, s, s);
                    c.material.opacity = 0.35 * (1 - Math.sin(t) * 0.4);
                }
            }
        }
        renderer.render(scene, camera);
    }
})();
