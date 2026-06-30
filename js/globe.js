/**
 * Interactive 3D Globe — Social Science Gallery
 * Schematic continents with distinct color regions, graticule grid,
 * and a marker at the China–Vietnam border research site.
 */
(function() {
    const STUDY_AREA = { lat: 21.55, lng: 107.97, name: 'Dongxing\u2013M\u00f3ng C\u00e1i' };

    let scene, camera, renderer, globe, markerGroup;
    let isUserInteracting = false;
    let targetRotX = 0, targetRotY = 0;
    let mouseX0 = 0, mouseY0 = 0;
    let autoRotate = true;
    let resumeTimer = null;

    const container = document.getElementById('globe-canvas');
    if (!container) return;

    init();
    animate();

    function init() {
        const w = container.clientWidth, h = container.clientHeight;
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
        camera.position.z = 3.2;
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        container.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xffffff, 0.9));
        const dir = new THREE.DirectionalLight(0xffffff, 0.3);
        dir.position.set(5, 3, 5);
        scene.add(dir);

        createGlobe();
        createGraticule();
        createContinentRegions();
        createMarker();
        createAtmosphere();
        createStars();

        // Initial rotation to show study area
        const phi = (90 - STUDY_AREA.lat) * Math.PI / 180;
        const theta = (STUDY_AREA.lng + 180) * Math.PI / 180;
        targetRotX = -(theta - Math.PI);
        targetRotY = -(phi - Math.PI / 2) * 0.3;

        container.addEventListener('mousedown', onDown);
        container.addEventListener('mousemove', onMove);
        container.addEventListener('mouseup', onUp);
        container.addEventListener('mouseleave', onUp);
        container.addEventListener('wheel', onWheel, { passive: false });
        container.addEventListener('touchstart', onTouchStart, { passive: false });
        container.addEventListener('touchmove', onTouchMove, { passive: false });
        container.addEventListener('touchend', onUp);
        window.addEventListener('resize', onResize);
    }

    function ll2v(lat, lng, r) {
        const phi = (90 - lat) * Math.PI / 180;
        const theta = (lng + 180) * Math.PI / 180;
        return new THREE.Vector3(
            -(r * Math.sin(phi) * Math.cos(theta)),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        );
    }

    function createGlobe() {
        const geo = new THREE.SphereGeometry(1, 64, 64);
        const mat = new THREE.MeshPhongMaterial({
            color: 0x1a2a3e,
            specular: 0x111122,
            shininess: 8,
            transparent: true,
            opacity: 0.95
        });
        globe = new THREE.Mesh(geo, mat);
        scene.add(globe);
    }

    function createGraticule() {
        var g = new THREE.Group();
        var r = 1.001;
        var lineMat = new THREE.LineBasicMaterial({ color: 0x4a7a9a, transparent: true, opacity: 0.25 });
        var eqMat = new THREE.LineBasicMaterial({ color: 0xd4a574, transparent: true, opacity: 0.5 });

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

    function createContinentRegions() {
        var continents = {
            'North America': {
                color: 0x5b8a72,
                coords: [[72,-168],[74,-141],[72,-128],[69,-112],[64,-100],[60,-93],[58,-85],[54,-78],[50,-67],[46,-62],[44,-66],[42,-70],[38,-75],[35,-77],[30,-81],[28,-85],[26,-90],[25,-97],[22,-105],[24,-110],[28,-114],[32,-117],[34,-120],[38,-123],[42,-124],[46,-124],[49,-127],[52,-130],[55,-132],[57,-136],[59,-140],[61,-147],[63,-152],[65,-158],[67,-162],[70,-166],[72,-168]]
            },
            'South America': {
                color: 0x7a9a5b,
                coords: [[12,-72],[10,-67],[8,-62],[5,-55],[2,-50],[0,-48],[-3,-42],[-6,-38],[-10,-37],[-13,-39],[-17,-40],[-20,-42],[-23,-44],[-27,-48],[-30,-50],[-33,-53],[-37,-57],[-40,-62],[-43,-65],[-47,-67],[-50,-70],[-53,-71],[-55,-68],[-52,-72],[-48,-74],[-43,-73],[-38,-72],[-33,-71],[-28,-70],[-23,-68],[-18,-70],[-13,-75],[-8,-78],[-4,-80],[0,-78],[3,-77],[7,-75],[10,-74],[12,-72]]
            },
            'Europe': {
                color: 0x8a7a5b,
                coords: [[71,28],[70,20],[69,12],[67,5],[65,-2],[62,-8],[58,-10],[55,-8],[52,-6],[49,-5],[46,-4],[43,-7],[38,-6],[36,-5],[36,0],[37,5],[38,10],[39,15],[41,20],[42,25],[43,28],[44,32],[46,35],[48,37],[50,40],[53,42],[55,40],[57,38],[59,35],[60,32],[62,30],[64,28],[66,25],[68,27],[70,28],[71,28]]
            },
            'Africa': {
                color: 0x9a7a4a,
                coords: [[37,10],[36,5],[35,0],[34,-5],[32,-8],[28,-12],[24,-16],[20,-17],[16,-16],[12,-15],[8,-12],[5,-8],[2,-5],[0,5],[-2,10],[-5,12],[-8,14],[-12,16],[-16,18],[-20,20],[-24,22],[-28,24],[-30,27],[-32,28],[-34,22],[-34,18],[-32,30],[-28,33],[-24,36],[-20,38],[-15,40],[-10,42],[-5,43],[0,44],[5,42],[10,44],[14,48],[18,44],[22,40],[25,38],[28,35],[30,33],[32,30],[34,28],[36,22],[37,15],[37,10]]
            },
            'Asia': {
                color: 0x6a8a7a,
                coords: [[72,55],[72,65],[71,78],[70,90],[70,100],[70,115],[70,130],[68,140],[66,150],[64,160],[62,168],[58,165],[54,158],[50,155],[47,148],[44,140],[42,135],[38,130],[35,128],[32,125],[28,120],[24,118],[20,112],[16,108],[12,104],[8,100],[5,95],[8,82],[12,77],[18,73],[22,70],[25,66],[28,60],[30,55],[32,50],[35,47],[38,44],[40,42],[42,44],[44,48],[47,52],[50,55],[54,58],[58,57],[62,55],[66,55],[70,55],[72,55]]
            },
            'Australia': {
                color: 0x9a6a5a,
                coords: [[-12,132],[-13,136],[-14,140],[-16,143],[-19,146],[-22,149],[-25,152],[-28,153],[-31,152],[-34,151],[-37,149],[-38,146],[-38,142],[-36,138],[-35,134],[-33,130],[-31,126],[-28,122],[-25,118],[-22,115],[-20,114],[-17,117],[-15,122],[-13,127],[-12,132]]
            },
            'Antarctica': {
                color: 0x8a9aaa,
                coords: [[-68,-180],[-70,-150],[-72,-120],[-74,-90],[-72,-60],[-70,-30],[-68,0],[-70,30],[-72,60],[-74,90],[-72,120],[-70,150],[-68,180]]
            }
        };

        var cGroup = new THREE.Group();
        var entries = Object.entries(continents);
        for (var i = 0; i < entries.length; i++) {
            var name = entries[i][0];
            var data = entries[i][1];
            var pts = [];
            for (var j = 0; j < data.coords.length; j++) {
                pts.push(ll2v(data.coords[j][0], data.coords[j][1], 1.003));
            }
            // Outline
            var lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
            var lineMat = new THREE.LineBasicMaterial({ color: 0xf0e6c8, transparent: true, opacity: 0.6 });
            cGroup.add(new THREE.Line(lineGeo, lineMat));

            // Fill via fan triangulation from centroid
            var centLat = 0, centLng = 0;
            for (var k = 0; k < data.coords.length; k++) {
                centLat += data.coords[k][0];
                centLng += data.coords[k][1];
            }
            centLat /= data.coords.length;
            centLng /= data.coords.length;
            var center = ll2v(centLat, centLng, 1.002);

            var positions = [];
            for (var m = 0; m < pts.length - 1; m++) {
                positions.push(center.x, center.y, center.z);
                positions.push(pts[m].x, pts[m].y, pts[m].z);
                positions.push(pts[m + 1].x, pts[m + 1].y, pts[m + 1].z);
            }
            var fillGeo = new THREE.BufferGeometry();
            fillGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            fillGeo.computeVertexNormals();
            var fillMat = new THREE.MeshBasicMaterial({ color: data.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide });
            cGroup.add(new THREE.Mesh(fillGeo, fillMat));

            // Label
            var sprite = makeLabel(name);
            sprite.position.copy(ll2v(centLat, centLng, 1.06));
            cGroup.add(sprite);
        }
        globe.add(cGroup);
    }

    function makeLabel(text) {
        var canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        var ctx = canvas.getContext('2d');
        ctx.font = '600 42px "Source Sans Pro", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillText(text, 257, 66);
        ctx.fillStyle = 'rgba(240,230,200,0.9)';
        ctx.fillText(text, 256, 64);
        var tex = new THREE.CanvasTexture(canvas);
        var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
        var sp = new THREE.Sprite(mat);
        sp.scale.set(0.4, 0.1, 1);
        return sp;
    }

    function createMarker() {
        markerGroup = new THREE.Group();
        var pos = ll2v(STUDY_AREA.lat, STUDY_AREA.lng, 1.015);

        var pin = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
        pin.position.copy(pos);
        markerGroup.add(pin);

        var ring = new THREE.Mesh(new THREE.RingGeometry(0.026, 0.036, 32), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
        ring.position.copy(pos);
        ring.lookAt(new THREE.Vector3(0, 0, 0));
        markerGroup.add(ring);

        var outer = new THREE.Mesh(new THREE.RingGeometry(0.042, 0.052, 32), new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
        outer.position.copy(pos);
        outer.lookAt(new THREE.Vector3(0, 0, 0));
        outer.userData.isPulse = true;
        markerGroup.add(outer);

        var label = makeLabel(STUDY_AREA.name);
        label.position.copy(pos.clone().multiplyScalar(1.1));
        label.scale.set(0.35, 0.09, 1);
        markerGroup.add(label);

        globe.add(markerGroup);
    }

    function createAtmosphere() {
        var geo = new THREE.SphereGeometry(1.15, 64, 64);
        var mat = new THREE.ShaderMaterial({
            vertexShader: 'varying vec3 vN; void main(){vN=normalize(normalMatrix*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
            fragmentShader: 'varying vec3 vN; void main(){float i=pow(0.65-dot(vN,vec3(0,0,1)),2.5);gl_FragColor=vec4(0.3,0.6,0.9,1.0)*i*0.4;}',
            blending: THREE.AdditiveBlending,
            side: THREE.BackSide,
            transparent: true
        });
        scene.add(new THREE.Mesh(geo, mat));
    }

    function createStars() {
        var geo = new THREE.BufferGeometry();
        var pos = [];
        for (var i = 0; i < 2000; i++) {
            var r = 40 + Math.random() * 30;
            var t = Math.random() * Math.PI * 2;
            var p = Math.acos(2 * Math.random() - 1);
            pos.push(r * Math.sin(p) * Math.cos(t), r * Math.sin(p) * Math.sin(t), r * Math.cos(p));
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, transparent: true, opacity: 0.6 })));
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
        if (autoRotate && !isUserInteracting) targetRotX += 0.0012;
        if (globe) {
            globe.rotation.y += (targetRotX - globe.rotation.y) * 0.05;
            globe.rotation.x += (targetRotY - globe.rotation.x) * 0.05;
        }
        if (markerGroup) {
            var t = Date.now() * 0.003;
            for (var i = 0; i < markerGroup.children.length; i++) {
                var c = markerGroup.children[i];
                if (c.userData && c.userData.isPulse) {
                    var s = 1 + Math.sin(t) * 0.35;
                    c.scale.set(s, s, s);
                    c.material.opacity = 0.4 * (1 - Math.sin(t) * 0.4);
                }
            }
        }
        renderer.render(scene, camera);
    }
})();
