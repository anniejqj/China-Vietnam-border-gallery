/**
 * Interactive 3D Globe — Social Science Gallery
 * HGIS UW-inspired dark, minimalist style.
 * Accurate country boundaries from Natural Earth 110m data,
 * rendered as fine line work over a deep navy sphere.
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
        camera.position.z = 3.1;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        // Soft ambient light only — no harsh directional shadows
        scene.add(new THREE.AmbientLight(0xffffff, 0.7));
        var rim = new THREE.DirectionalLight(0xaaccff, 0.25);
        rim.position.set(-5, 2, 5);
        scene.add(rim);

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
        targetRotY = -(phi - Math.PI / 2) * 0.2;

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

    // Brighter Morandi palette per continent (still muted / low saturation)
    var MORANDI_COLORS = {
        'North America': 0x8FAE98,
        'South America': 0xC4A77D,
        'Europe': 0x9BB5A5,
        'Africa': 0xC9957A,
        'Asia': 0x8BAE9C,
        'Oceania': 0xC4A574,
        'Seven seas (open ocean)': 0xA8B5B9,
        'Antarctica': 0xA8B5B9
    };

    function buildGlobe(data) {
        // 1. Continent fills — brighter Morandi colors, subtle but visible
        Object.keys(data.continents).forEach(function(name) {
            var cont = data.continents[name];
            var color = MORANDI_COLORS[name] || 0x8B8B7A;
            var positions = [];
            cont.polygons.forEach(function(poly) {
                if (poly.type === 'Polygon') {
                    triangulateRing(poly.coords[0], positions, 1.0012);
                } else if (poly.type === 'MultiPolygon') {
                    poly.coords.forEach(function(p) { triangulateRing(p[0], positions, 1.0012); });
                }
            });
            if (positions.length === 0) return;
            var geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            geo.computeVertexNormals();
            var mat = new THREE.MeshLambertMaterial({
                color: color,
                transparent: true,
                opacity: 0.6,
                side: THREE.DoubleSide
            });
            var mesh = new THREE.Mesh(geo, mat);
            mesh.name = 'continent-fill-' + name;
            globe.add(mesh);
        });

        // 2. Accurate country boundaries as fine light lines
        var linePositions = [];
        data.countryOutlines.forEach(function(country) {
            appendPolygonLines(country.coords, country.type, linePositions, 1.0028);
        });
        if (linePositions.length > 0) {
            var lineGeo = new THREE.BufferGeometry();
            lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
            var lineMat = new THREE.LineBasicMaterial({ color: 0xdde3ea, transparent: true, opacity: 0.62 });
            globe.add(new THREE.LineSegments(lineGeo, lineMat));
        }

        // 3. Coastline outline — warm off-white for soft definition
        var coastPositions = [];
        data.landmass.forEach(function(poly) {
            if (poly.type === 'Polygon') {
                appendPolygonLines(poly.coords, 'Polygon', coastPositions, 1.0033);
            } else if (poly.type === 'MultiPolygon') {
                appendPolygonLines(poly.coords, 'MultiPolygon', coastPositions, 1.0033);
            }
        });
        if (coastPositions.length > 0) {
            var coastGeo = new THREE.BufferGeometry();
            coastGeo.setAttribute('position', new THREE.Float32BufferAttribute(coastPositions, 3));
            var coastMat = new THREE.LineBasicMaterial({ color: 0xf0e6c8, transparent: true, opacity: 0.42 });
            globe.add(new THREE.LineSegments(coastGeo, coastMat));
        }

        // 4. Continent labels (subtle)
        Object.keys(data.continents).forEach(function(name) {
            var cont = data.continents[name];
            var centroid = computeCentroid(cont.polygons);
            if (centroid) {
                var label = makeLabel(name);
                label.position.copy(ll2v(centroid.lat, centroid.lng, 1.06));
                globe.add(label);
            }
        });
    }

    function triangulateRing(ring, positions, radius) {
        if (ring.length < 3) return;
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
        var geo = new THREE.SphereGeometry(0.999, 64, 64);
        var mat = new THREE.MeshPhongMaterial({
            color: 0x111a25,
            specular: 0x050505,
            shininess: 4
        });
        globe.add(new THREE.Mesh(geo, mat));
    }

    function createGraticule() {
        var g = new THREE.Group();
        var r = 1.0005;
        var mat = new THREE.LineBasicMaterial({ color: 0x3a4a5a, transparent: true, opacity: 0.12 });

        for (var lat = -60; lat <= 60; lat += 30) {
            var pts = [];
            for (var lng = -180; lng <= 180; lng += 5) pts.push(ll2v(lat, lng, r));
            g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
        }
        for (var lng2 = -180; lng2 < 180; lng2 += 30) {
            var pts2 = [];
            for (var lat2 = -90; lat2 <= 90; lat2 += 5) pts2.push(ll2v(lat2, lng2, r));
            g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts2), mat));
        }
        globe.add(g);
    }

    function createMarker() {
        markerGroup = new THREE.Group();
        var pos = ll2v(STUDY_AREA.lat, STUDY_AREA.lng, 1.012);

        // Core dot
        var pin = new THREE.Mesh(
            new THREE.SphereGeometry(0.022, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffa94d })
        );
        pin.position.copy(pos);
        markerGroup.add(pin);

        // Inner ring
        var ring1 = new THREE.Mesh(
            new THREE.RingGeometry(0.028, 0.038, 32),
            new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.6, side: THREE.DoubleSide })
        );
        ring1.position.copy(pos);
        ring1.lookAt(new THREE.Vector3(0, 0, 0));
        markerGroup.add(ring1);

        // Pulsing outer ring
        var ring2 = new THREE.Mesh(
            new THREE.RingGeometry(0.045, 0.055, 32),
            new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: 0.3, side: THREE.DoubleSide })
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
        var geo = new THREE.SphereGeometry(1.11, 64, 64);
        var mat = new THREE.ShaderMaterial({
            vertexShader: 'varying vec3 vN; void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
            fragmentShader: 'varying vec3 vN; void main(){float i=pow(0.62-dot(vN,vec3(0,0,1.0)),2.8);gl_FragColor=vec4(0.45,0.65,0.85,1.0)*i*0.22;}',
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            transparent: true
        });
        scene.add(new THREE.Mesh(geo, mat));
    }

    function createStars() {
        var geo = new THREE.BufferGeometry();
        var pos = [];
        for (var i = 0; i < 1600; i++) {
            var r = 40 + Math.random() * 30;
            var t = Math.random() * Math.PI * 2;
            var p = Math.acos(2 * Math.random() - 1);
            pos.push(r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p));
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.11, transparent: true, opacity: 0.45 })));
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
        ctx.font = '600 38px "Source Sans Pro", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillText(text, 257, 66);
        ctx.fillStyle = 'rgba(234,230,222,0.75)';
        ctx.fillText(text, 256, 64);
        var tex = new THREE.CanvasTexture(canvas);
        var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        var sp = new THREE.Sprite(mat);
        sp.scale.set(0.36, 0.09, 1);
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
                    c.material.opacity = 0.3 * (1 - Math.sin(t) * 0.4);
                }
            }
        }
        renderer.render(scene, camera);
    }
})();
