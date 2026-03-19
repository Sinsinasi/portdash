/**
 * Home3D — Galaxy / Solar System with 3D Logo Models
 * Central sun with "WAS", 3D section logos orbiting,
 * right-click orbit controls (Blender-style), scroll zoom.
 * Enhanced: realistic sun, meteors, supernovae, twinkling stars.
 */
var Home3D = (function () {
    'use strict';

    var scene, camera, renderer, raycaster, mouse;
    var sun, sunCorona, sunGlow, sunGlowOuter, sunGlowCore;
    var solarFlares = [];
    var planets = [];       // THREE.Group per section
    var planetGlows = [];
    var orbitLines = [];
    var starField;
    var dustParticles = [];
    var labelEls = [];
    var containerEl, labelsEl;
    var animId = null;
    var isActive = false;
    var hoveredPlanet = null;

    // Zoom transition state
    var zoomTarget = null;       // planet group being zoomed into
    var zoomPage = null;         // page name to navigate to
    var zoomStartTime = 0;
    var zoomDuration = 1.0;      // seconds
    var zoomStartPos = null;     // camera start position {x,y,z}
    var isZooming = false;
    var transitionOverlay = null;

    // New arrays for enhanced effects
    var meteors = [];
    var supernovae = [];
    var twinklingStars = [];

    // Timers for spawning
    var nextMeteorTime = 0;
    var nextSupernovaTime = 0;

    // Mouse parallax
    var mouseTarget = { x: 0, y: 0 };
    var mouseLerp  = { x: 0, y: 0 };

    // Orbit camera (Blender-style right-click drag)
    var orbit = {
        theta: 0, phi: 1.35,
        targetTheta: 0, targetPhi: 1.35,
        radius: 22, targetRadius: 22,
        isDragging: false, lastX: 0, lastY: 0
    };

    var SECTIONS = [
        { name: 'Notes',    page: 'notes',    color: 0xC4B5FD, emissive: 0x6D28D9, orbR: 3.8,  orbSpeed: 0.32,  orbTilt: 0.25,  start: 0,              logoScale: 0.55 },
        { name: 'Trading',  page: 'trading',  color: 0x86EFAC, emissive: 0x059669, orbR: 5.5,  orbSpeed: 0.21,  orbTilt:-0.18,  start: Math.PI * 0.5,  logoScale: 0.50 },
        { name: 'YouTube',  page: 'youtube',  color: 0xFCA5A5, emissive: 0xDC2626, orbR: 7.2,  orbSpeed: 0.14,  orbTilt: 0.13,  start: Math.PI,        logoScale: 0.55 },
        { name: 'Finances', page: 'finances', color: 0x93C5FD, emissive: 0x2563EB, orbR: 9.0,  orbSpeed: 0.09,  orbTilt:-0.22,  start: Math.PI * 1.5,  logoScale: 0.80 }
    ];

    // ── Init / Destroy ──────────────────────────────────────────────────────

    function init() {
        if (isActive) return;
        containerEl = document.getElementById('home-3d-container');
        labelsEl    = document.getElementById('home-3d-labels');
        if (!containerEl || typeof THREE === 'undefined') return;

        orbit.radius = orbit.targetRadius = baseRadius();
        setupScene();
        setupLights();
        createSun();
        createPlanets();
        createOrbitRings();
        createStarField();
        createTwinklingStars();
        createDust();
        createLabels();
        bindEvents();
        isActive = true;
        nextMeteorTime = performance.now() * 0.001 + 2;
        nextSupernovaTime = performance.now() * 0.001 + 5;
        animate();
    }

    function destroy() {
        isActive = false;
        isZooming = false;
        zoomTarget = null;
        zoomPage = null;
        if (transitionOverlay && transitionOverlay.parentNode) {
            transitionOverlay.parentNode.removeChild(transitionOverlay);
            transitionOverlay = null;
        }
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        window.removeEventListener('resize', onResize);
        if (containerEl) {
            containerEl.removeEventListener('mousemove', onMouseMove);
            containerEl.removeEventListener('mousedown', onMouseDown);
            containerEl.removeEventListener('mouseup', onMouseUp);
            containerEl.removeEventListener('click', onClick);
            containerEl.removeEventListener('contextmenu', onContextMenu);
            containerEl.removeEventListener('wheel', onWheel);
            containerEl.removeEventListener('touchstart', onTouch);
        }
        if (renderer) {
            renderer.dispose();
            if (renderer.domElement && renderer.domElement.parentNode)
                renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
        // Dispose sun
        if (sun) { if (sun.material.map) sun.material.map.dispose(); sun.geometry.dispose(); sun.material.dispose(); }
        if (sunCorona) { sunCorona.geometry.dispose(); sunCorona.material.dispose(); }
        if (sunGlow) { if (sunGlow.material.map) sunGlow.material.map.dispose(); sunGlow.material.dispose(); }
        if (sunGlowOuter) { if (sunGlowOuter.material.map) sunGlowOuter.material.map.dispose(); sunGlowOuter.material.dispose(); }
        if (sunGlowCore) { if (sunGlowCore.material.map) sunGlowCore.material.map.dispose(); sunGlowCore.material.dispose(); }
        // Dispose solar flares
        solarFlares.forEach(function (f) { if (f.material.map) f.material.map.dispose(); f.material.dispose(); });
        // Dispose planet groups recursively
        planets.forEach(function (p) {
            p.traverse(function (c) {
                if (c.isMesh) {
                    if (c.geometry) c.geometry.dispose();
                    if (c.material) { if (c.material.map) c.material.map.dispose(); c.material.dispose(); }
                }
            });
        });
        planetGlows.forEach(function (g) { if (g.material.map) g.material.map.dispose(); g.material.dispose(); });
        orbitLines.forEach(function (l) { l.geometry.dispose(); l.material.dispose(); });
        dustParticles.forEach(function (d) { d.geometry.dispose(); d.material.dispose(); });
        if (starField) { starField.geometry.dispose(); starField.material.dispose(); }

        // Dispose meteors
        meteors.forEach(function (m) {
            if (m.group && m.group.parent) m.group.parent.remove(m.group);
            m.sprites.forEach(function (s) { if (s.material.map) s.material.map.dispose(); s.material.dispose(); });
        });

        // Dispose supernovae
        supernovae.forEach(function (sn) {
            if (sn.sprite && sn.sprite.parent) sn.sprite.parent.remove(sn.sprite);
            if (sn.sprite) { if (sn.sprite.material.map) sn.sprite.material.map.dispose(); sn.sprite.material.dispose(); }
        });

        // Dispose twinkling stars
        twinklingStars.forEach(function (ts) {
            if (ts.sprite && ts.sprite.parent) ts.sprite.parent.remove(ts.sprite);
            if (ts.sprite) { if (ts.sprite.material.map) ts.sprite.material.map.dispose(); ts.sprite.material.dispose(); }
        });

        planets = []; planetGlows = []; orbitLines = []; dustParticles = []; labelEls = [];
        meteors = []; supernovae = []; twinklingStars = []; solarFlares = [];
        sun = sunCorona = sunGlow = sunGlowOuter = sunGlowCore = starField = null;
        scene = camera = renderer = raycaster = null;
        hoveredPlanet = null;
    }

    // ── Scene ───────────────────────────────────────────────────────────────

    function setupScene() {
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x030308, 0.008);
        var w = containerEl.clientWidth, h = containerEl.clientHeight;
        camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.2;
        containerEl.appendChild(renderer.domElement);
        raycaster = new THREE.Raycaster();
        mouse = new THREE.Vector2(-10, -10);
    }

    function baseRadius() {
        if (!containerEl) return 22;
        var a = containerEl.clientWidth / containerEl.clientHeight;
        if (a < 0.7) return 36;
        if (a < 1.0) return 28;
        return 22;
    }

    // ── Lights ──────────────────────────────────────────────────────────────

    function setupLights() {
        scene.add(new THREE.AmbientLight(0x1a1a3a, 0.4));
        var sunLight = new THREE.PointLight(0xFFDD88, 2.5, 60, 1.5);
        scene.add(sunLight);
        var fill = new THREE.DirectionalLight(0x8888ff, 0.12);
        fill.position.set(-10, 5, -10); scene.add(fill);
        var fill2 = new THREE.DirectionalLight(0xff8888, 0.08);
        fill2.position.set(10, -3, 5); scene.add(fill2);
    }

    // ── Glow Texture ────────────────────────────────────────────────────────

    function createGlowTexture() {
        var s = 128, c = document.createElement('canvas');
        c.width = s; c.height = s;
        var ctx = c.getContext('2d'), h = s / 2;
        var g = ctx.createRadialGradient(h, h, 0, h, h, h);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.15, 'rgba(255,255,255,0.7)');
        g.addColorStop(0.4, 'rgba(255,255,255,0.2)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
        return new THREE.CanvasTexture(c);
    }

    // ── Sun ─────────────────────────────────────────────────────────────────

    function createSun() {
        // Enhanced sun texture with sunspots and glowing WAS text
        var tc = document.createElement('canvas');
        tc.width = 1024; tc.height = 512;
        var ctx = tc.getContext('2d');

        // Complex gradient: white center -> bright yellow -> orange -> deep red at edges
        var g = ctx.createRadialGradient(512, 256, 0, 512, 256, 512);
        g.addColorStop(0, '#FFFFFF');
        g.addColorStop(0.1, '#FFFDE7');
        g.addColorStop(0.25, '#FFE082');
        g.addColorStop(0.45, '#FFB300');
        g.addColorStop(0.65, '#FF8F00');
        g.addColorStop(0.82, '#E65100');
        g.addColorStop(1, '#BF360C');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 1024, 512);

        // Add ~20 random semi-transparent dark circles for sunspots
        var si;
        for (si = 0; si < 20; si++) {
            var spotX = Math.random() * 1024;
            var spotY = Math.random() * 512;
            var spotR = 5 + Math.random() * 25;
            var spotAlpha = 0.05 + Math.random() * 0.15;
            ctx.beginPath();
            ctx.arc(spotX, spotY, spotR, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(80,30,0,' + spotAlpha + ')';
            ctx.fill();
        }

        // WAS text with glow effect - draw once with shadowBlur for glow
        ctx.font = '900 160px Inter, Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(255,255,255,0.9)';
        ctx.shadowBlur = 40;
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillText('WAS', 512, 256);
        ctx.fillText('WAS', 512, 256); // double draw for stronger glow

        // Draw again sharp on top (no shadow)
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255,255,255,0.95)';
        ctx.fillText('WAS', 512, 256);

        var tex = new THREE.CanvasTexture(tc);

        // Inner core sphere - bright white/yellow, high emissive
        sun = new THREE.Mesh(
            new THREE.SphereGeometry(1.2, 48, 48),
            new THREE.MeshStandardMaterial({
                map: tex,
                emissive: 0xFFCC44,
                emissiveIntensity: 1.2,
                roughness: 0.3
            })
        );
        scene.add(sun);

        // Outer corona sphere - slightly larger, transparent, animated
        sunCorona = new THREE.Mesh(
            new THREE.SphereGeometry(1.4, 48, 48),
            new THREE.MeshStandardMaterial({
                color: 0xFFAA33,
                emissive: 0xFF8800,
                emissiveIntensity: 0.6,
                transparent: true,
                opacity: 0.25,
                roughness: 0.5,
                depthWrite: false,
                side: THREE.FrontSide
            })
        );
        scene.add(sunCorona);

        // Glow sprites for layered corona effect
        var glowTex = createGlowTexture();

        // Inner bright glow (small, bright)
        sunGlowCore = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTex, color: 0xFFEECC, transparent: true,
            opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        sunGlowCore.scale.setScalar(5);
        scene.add(sunGlowCore);

        // Mid glow
        sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTex, color: 0xFFAA44, transparent: true,
            opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        sunGlow.scale.setScalar(8);
        scene.add(sunGlow);

        // Large dim outer glow
        sunGlowOuter = new THREE.Sprite(new THREE.SpriteMaterial({
            map: glowTex, color: 0xFF6622, transparent: true,
            opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false
        }));
        sunGlowOuter.scale.setScalar(14);
        scene.add(sunGlowOuter);

        // Solar flare particles: ~8 small sprites orbiting close to the sun surface
        var flareTex = createGlowTexture();
        for (var fi = 0; fi < 8; fi++) {
            var flareSize = 0.15 + Math.random() * 0.25;
            var flareMat = new THREE.SpriteMaterial({
                map: flareTex, color: new THREE.Color().setHSL(0.08 + Math.random() * 0.08, 1.0, 0.6 + Math.random() * 0.3),
                transparent: true, opacity: 0.4 + Math.random() * 0.4,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            var flareSprite = new THREE.Sprite(flareMat);
            flareSprite.scale.setScalar(flareSize);
            flareSprite.userData = {
                orbitRadius: 1.5 + Math.random() * 0.4,
                theta: Math.random() * Math.PI * 2,
                phi: (Math.random() - 0.5) * Math.PI * 0.8,
                speedTheta: (0.3 + Math.random() * 0.7) * (Math.random() < 0.5 ? 1 : -1),
                speedPhi: (0.1 + Math.random() * 0.3) * (Math.random() < 0.5 ? 1 : -1),
                wobblePhase: Math.random() * Math.PI * 2,
                wobbleSpeed: 1 + Math.random() * 3,
                wobbleAmp: 0.05 + Math.random() * 0.15
            };
            scene.add(flareSprite);
            solarFlares.push(flareSprite);
        }
    }

    // ════════════════════════════════════════════════════════════════════════
    //  3D LOGO BUILDERS
    // ════════════════════════════════════════════════════════════════════════

    function createNotesLogo() {
        var grp = new THREE.Group();
        var pageMat = new THREE.MeshStandardMaterial({ color: 0xF0E6FF, roughness: 0.45, emissive: 0x6D28D9, emissiveIntensity: 0.08 });
        var darkMat = new THREE.MeshStandardMaterial({ color: 0xD4C0FF, roughness: 0.5 });
        var lineMat = new THREE.MeshStandardMaterial({ color: 0x8B7FC7, roughness: 0.6 });

        // Back page
        var p2 = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.35, 0.04), darkMat);
        p2.position.set(0.04, -0.03, -0.05); p2.rotation.z = 0.04;
        grp.add(p2);

        // Front page
        grp.add(new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.35, 0.06), pageMat));

        // Folded corner
        var fShape = new THREE.Shape();
        fShape.moveTo(0, 0); fShape.lineTo(-0.22, 0); fShape.lineTo(0, -0.22); fShape.closePath();
        var fold = new THREE.Mesh(
            new THREE.ExtrudeGeometry(fShape, { depth: 0.065, bevelEnabled: false }),
            darkMat
        );
        fold.position.set(0.525, 0.675, -0.002);
        grp.add(fold);

        // Text lines
        var widths = [0.65, 0.65, 0.65, 0.4];
        for (var i = 0; i < 4; i++) {
            var ln = new THREE.Mesh(new THREE.BoxGeometry(widths[i], 0.04, 0.065), lineMat);
            ln.position.set(i === 3 ? -0.12 : 0, 0.2 - i * 0.2, 0);
            grp.add(ln);
        }
        return grp;
    }

    function createTradingLogo() {
        var grp = new THREE.Group();
        var bars = [
            { h: 0.55, c: 0x22c55e, x: -0.38 },
            { h: 0.9,  c: 0x22c55e, x: -0.13 },
            { h: 0.4,  c: 0xef4444, x: 0.12 },
            { h: 1.15, c: 0x22c55e, x: 0.37 }
        ];
        for (var i = 0; i < bars.length; i++) {
            var b = bars[i];
            var bar = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, b.h, 0.2),
                new THREE.MeshStandardMaterial({ color: b.c, roughness: 0.35, metalness: 0.1, emissive: b.c, emissiveIntensity: 0.1 })
            );
            bar.position.set(b.x, b.h / 2 - 0.45, 0);
            grp.add(bar);
        }
        // Base
        var base = new THREE.Mesh(
            new THREE.BoxGeometry(1.2, 0.06, 0.35),
            new THREE.MeshStandardMaterial({ color: 0x1a3a2a, roughness: 0.6 })
        );
        base.position.y = -0.48;
        grp.add(base);

        // Upward arrow
        var aShape = new THREE.Shape();
        aShape.moveTo(0, 0.2); aShape.lineTo(0.14, 0); aShape.lineTo(0.05, 0);
        aShape.lineTo(0.05, -0.25); aShape.lineTo(-0.05, -0.25); aShape.lineTo(-0.05, 0);
        aShape.lineTo(-0.14, 0); aShape.closePath();
        var arrow = new THREE.Mesh(
            new THREE.ExtrudeGeometry(aShape, { depth: 0.08, bevelEnabled: false }),
            new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.3, emissive: 0x22c55e, emissiveIntensity: 0.15 })
        );
        arrow.position.set(0.37, 0.95, -0.04);
        grp.add(arrow);
        return grp;
    }

    function createYouTubeLogo() {
        var grp = new THREE.Group();

        // Rounded rectangle body
        var w = 1.5, h = 1.05, r = 0.22;
        var s = new THREE.Shape();
        s.moveTo(-w/2 + r, -h/2);
        s.lineTo(w/2 - r, -h/2);
        s.quadraticCurveTo(w/2, -h/2, w/2, -h/2 + r);
        s.lineTo(w/2, h/2 - r);
        s.quadraticCurveTo(w/2, h/2, w/2 - r, h/2);
        s.lineTo(-w/2 + r, h/2);
        s.quadraticCurveTo(-w/2, h/2, -w/2, h/2 - r);
        s.lineTo(-w/2, -h/2 + r);
        s.quadraticCurveTo(-w/2, -h/2, -w/2 + r, -h/2);

        var bodyGeo = new THREE.ExtrudeGeometry(s, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3 });
        bodyGeo.center();
        var body = new THREE.Mesh(bodyGeo, new THREE.MeshStandardMaterial({
            color: 0xFF0000, roughness: 0.35, emissive: 0x880000, emissiveIntensity: 0.15
        }));
        grp.add(body);

        // Play triangle
        var t = new THREE.Shape();
        t.moveTo(-0.18, -0.28); t.lineTo(0.28, 0); t.lineTo(-0.18, 0.28); t.closePath();
        var triGeo = new THREE.ExtrudeGeometry(t, { depth: 0.04, bevelEnabled: false });
        triGeo.center();
        var tri = new THREE.Mesh(triGeo, new THREE.MeshStandardMaterial({
            color: 0xffffff, roughness: 0.3, emissive: 0xffffff, emissiveIntensity: 0.08
        }));
        tri.position.set(0.03, 0, 0.2);
        grp.add(tri);
        return grp;
    }

    function createFinancesLogo() {
        var grp = new THREE.Group();

        // Coin face texture
        var tc = document.createElement('canvas');
        tc.width = 256; tc.height = 256;
        var ctx = tc.getContext('2d');
        var g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
        g.addColorStop(0, '#FFD700'); g.addColorStop(0.6, '#DAA520'); g.addColorStop(1, '#B8860B');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
        ctx.font = '900 150px Inter, Arial, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#8B6914'; ctx.fillText('$', 128, 132);
        ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillText('$', 126, 130);
        var coinTex = new THREE.CanvasTexture(tc);

        // Rim (open-ended cylinder)
        var rimGeo = new THREE.CylinderGeometry(0.7, 0.7, 0.14, 48, 1, true);
        rimGeo.rotateX(Math.PI / 2);
        var rimMat = new THREE.MeshStandardMaterial({ color: 0xB8860B, roughness: 0.3, metalness: 0.55 });
        grp.add(new THREE.Mesh(rimGeo, rimMat));

        // Front face
        var faceGeo = new THREE.CircleGeometry(0.7, 48);
        var faceMat = new THREE.MeshStandardMaterial({
            map: coinTex, roughness: 0.3, metalness: 0.45, emissive: 0xDAA520, emissiveIntensity: 0.08
        });
        var front = new THREE.Mesh(faceGeo, faceMat);
        front.position.z = 0.07;
        grp.add(front);

        // Back face
        var back = new THREE.Mesh(faceGeo.clone(), faceMat);
        back.position.z = -0.07;
        back.rotation.y = Math.PI;
        grp.add(back);

        // Edge bevel ring
        var ring = new THREE.Mesh(
            new THREE.TorusGeometry(0.7, 0.022, 8, 48),
            new THREE.MeshStandardMaterial({ color: 0xB8860B, roughness: 0.3, metalness: 0.6 })
        );
        ring.position.z = 0.07;
        grp.add(ring);
        var ring2 = ring.clone(); ring2.position.z = -0.07;
        grp.add(ring2);

        return grp;
    }

    function createLogo(page) {
        switch (page) {
            case 'notes':    return createNotesLogo();
            case 'trading':  return createTradingLogo();
            case 'youtube':  return createYouTubeLogo();
            case 'finances': return createFinancesLogo();
            default:         return new THREE.Group();
        }
    }

    // ── Planets (3D logos orbiting) ─────────────────────────────────────────

    function createPlanets() {
        var glowTex = createGlowTexture();

        for (var i = 0; i < SECTIONS.length; i++) {
            var s     = SECTIONS[i];
            var group = createLogo(s.page);
            group.scale.setScalar(s.logoScale);
            group.userData = {
                page: s.page, name: s.name, idx: i,
                orbR: s.orbR, orbSpeed: s.orbSpeed, orbTilt: s.orbTilt,
                startAngle: s.start, logoScale: s.logoScale,
                scaleTarget: 1, scaleCurrent: 1
            };

            // Glow sprite
            var gMat = new THREE.SpriteMaterial({
                map: glowTex, color: s.color, transparent: true,
                opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false
            });
            var gSprite = new THREE.Sprite(gMat);
            var baseGS = s.logoScale * 4;
            gSprite.scale.setScalar(baseGS);
            gSprite.userData = {
                baseOpacity: 0.14, baseScale: baseGS,
                opacityTarget: 0.14, scaleTarget: baseGS,
                opacityCurrent: 0.14, scaleCurrent: baseGS
            };
            scene.add(gSprite);
            planetGlows.push(gSprite);

            scene.add(group);
            planets.push(group);
        }
    }

    // ── Orbit Rings ─────────────────────────────────────────────────────────

    function createOrbitRings() {
        for (var i = 0; i < SECTIONS.length; i++) {
            var s = SECTIONS[i], pts = [];
            for (var a = 0; a <= Math.PI * 2 + 0.01; a += 0.04) {
                var lx = s.orbR * Math.cos(a), lz = s.orbR * Math.sin(a);
                pts.push(new THREE.Vector3(lx, lz * Math.sin(s.orbTilt), lz * Math.cos(s.orbTilt)));
            }
            var line = new THREE.LineLoop(
                new THREE.BufferGeometry().setFromPoints(pts),
                new THREE.LineBasicMaterial({ color: s.color, transparent: true, opacity: 0.06, depthWrite: false })
            );
            scene.add(line);
            orbitLines.push(line);
        }
    }

    // ── Star Field ──────────────────────────────────────────────────────────

    function createStarField() {
        var n = 1000, pos = new Float32Array(n * 3);
        for (var i = 0; i < n; i++) {
            var th = Math.random() * Math.PI * 2;
            var ph = Math.acos(2 * Math.random() - 1);
            var r  = 30 + Math.random() * 60;
            pos[i*3] = r * Math.sin(ph) * Math.cos(th);
            pos[i*3+1] = r * Math.sin(ph) * Math.sin(th);
            pos[i*3+2] = r * Math.cos(ph);
        }
        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        starField = new THREE.Points(geo, new THREE.PointsMaterial({
            color: 0xffffff, size: 0.1, sizeAttenuation: true, transparent: true, opacity: 0.6
        }));
        scene.add(starField);
    }

    // ── Twinkling Stars ─────────────────────────────────────────────────────

    function createTwinklingStars() {
        var glowTex = createGlowTexture();
        var starColors = [
            0xFFFFFF, 0xFFFFFF, 0xFFFFFF, 0xFFFFFF,   // mostly white
            0xAABBFF, 0xAABBFF,                         // pale blue
            0xFFFFAA, 0xFFFFAA,                         // pale yellow
            0xFFBBAA, 0xFFBBAA                          // pale red
        ];
        var numTwinkling = 60 + Math.floor(Math.random() * 20); // 60-80
        for (var i = 0; i < numTwinkling; i++) {
            var th = Math.random() * Math.PI * 2;
            var ph = Math.acos(2 * Math.random() - 1);
            var r  = 35 + Math.random() * 50;
            var x = r * Math.sin(ph) * Math.cos(th);
            var y = r * Math.sin(ph) * Math.sin(th);
            var z = r * Math.cos(ph);
            var starColor = starColors[Math.floor(Math.random() * starColors.length)];
            var starMat = new THREE.SpriteMaterial({
                map: glowTex, color: starColor, transparent: true,
                opacity: 0.1 + Math.random() * 0.7,
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            var starSprite = new THREE.Sprite(starMat);
            var starScale = 0.15 + Math.random() * 0.35;
            starSprite.scale.setScalar(starScale);
            starSprite.position.set(x, y, z);
            starSprite.userData = {
                phase: Math.random() * Math.PI * 2,
                frequency: 0.5 + Math.random() * 2.5,
                minOpacity: 0.1,
                maxOpacity: 0.8,
                baseScale: starScale
            };
            scene.add(starSprite);
            twinklingStars.push({ sprite: starSprite });
        }
    }

    function updateTwinklingStars(t) {
        for (var i = 0; i < twinklingStars.length; i++) {
            var ts = twinklingStars[i].sprite;
            var ud = ts.userData;
            var val = Math.sin(t * ud.frequency + ud.phase);
            var opacity = ud.minOpacity + (ud.maxOpacity - ud.minOpacity) * (val * 0.5 + 0.5);
            ts.material.opacity = opacity;
        }
    }

    // ── Meteors ─────────────────────────────────────────────────────────────

    function spawnMeteor(t) {
        if (meteors.length >= 3) return;

        var glowTex = createGlowTexture();
        var group = new THREE.Group();

        // Random start position on the edge of the scene
        var angle1 = Math.random() * Math.PI * 2;
        var angle2 = (Math.random() - 0.5) * Math.PI * 0.6;
        var dist = 25 + Math.random() * 15;
        var startX = dist * Math.cos(angle2) * Math.cos(angle1);
        var startY = dist * Math.sin(angle2);
        var startZ = dist * Math.cos(angle2) * Math.sin(angle1);

        // Direction: generally toward the center area with some randomness
        var dirX = -startX * 0.7 + (Math.random() - 0.5) * 15;
        var dirY = -startY * 0.7 + (Math.random() - 0.5) * 10;
        var dirZ = -startZ * 0.7 + (Math.random() - 0.5) * 15;
        var dirLen = Math.sqrt(dirX * dirX + dirY * dirY + dirZ * dirZ);
        var speed = 8 + Math.random() * 12;
        var vx = (dirX / dirLen) * speed;
        var vy = (dirY / dirLen) * speed;
        var vz = (dirZ / dirLen) * speed;

        group.position.set(startX, startY, startZ);

        // Head sprite - bright glowing point
        var headMat = new THREE.SpriteMaterial({
            map: glowTex, color: 0xFFEEDD, transparent: true,
            opacity: 1.0, blending: THREE.AdditiveBlending, depthWrite: false
        });
        var headSprite = new THREE.Sprite(headMat);
        headSprite.scale.setScalar(0.15);
        group.add(headSprite);

        // Trail sprites - 8 progressively fading/shrinking sprites
        var trailCount = 8;
        var trailSprites = [headSprite]; // include head in sprites for cleanup
        var trailData = [];
        for (var ti = 0; ti < trailCount; ti++) {
            var frac = (ti + 1) / trailCount;
            var trailColor = new THREE.Color().setHSL(0.08 - frac * 0.03, 1.0, 0.9 - frac * 0.3);
            var trailMat = new THREE.SpriteMaterial({
                map: glowTex, color: trailColor, transparent: true,
                opacity: 0.8 * (1 - frac * 0.85),
                blending: THREE.AdditiveBlending, depthWrite: false
            });
            var trailSprite = new THREE.Sprite(trailMat);
            var trailScale = 0.12 * (1 - frac * 0.7);
            trailSprite.scale.setScalar(trailScale);
            trailSprite.position.set(0, 0, 0); // will be updated
            group.add(trailSprite);
            trailSprites.push(trailSprite);
            trailData.push({
                sprite: trailSprite,
                positions: [] // ring buffer of past head positions
            });
        }

        scene.add(group);

        var lifetime = 2 + Math.random() * 2;
        var meteorObj = {
            group: group,
            head: headSprite,
            sprites: trailSprites,
            trailData: trailData,
            posHistory: [], // array of {x,y,z}
            vx: vx, vy: vy, vz: vz,
            birthTime: t,
            lifetime: lifetime,
            alive: true
        };
        meteors.push(meteorObj);
    }

    function updateMeteors(t, dt) {
        // Spawn check
        if (t >= nextMeteorTime && meteors.length < 3) {
            spawnMeteor(t);
            nextMeteorTime = t + 3 + Math.random() * 5; // 3-8 seconds
        }

        for (var i = meteors.length - 1; i >= 0; i--) {
            var m = meteors[i];
            var age = t - m.birthTime;

            if (age >= m.lifetime) {
                // Remove
                if (m.group.parent) m.group.parent.remove(m.group);
                m.sprites.forEach(function (s) { if (s.material.map) s.material.map.dispose(); s.material.dispose(); });
                meteors.splice(i, 1);
                continue;
            }

            // Move
            m.group.position.x += m.vx * dt;
            m.group.position.y += m.vy * dt;
            m.group.position.z += m.vz * dt;

            // Store position history (world position of head)
            m.posHistory.unshift({
                x: m.group.position.x,
                y: m.group.position.y,
                z: m.group.position.z
            });
            // Keep only last 20 positions
            if (m.posHistory.length > 20) m.posHistory.length = 20;

            // Update trail sprites to follow historical positions
            for (var ti = 0; ti < m.trailData.length; ti++) {
                var spacing = 2 + ti; // how many frames back
                var histIdx = Math.min(spacing, m.posHistory.length - 1);
                if (histIdx >= 0 && m.posHistory[histIdx]) {
                    var hp = m.posHistory[histIdx];
                    // Convert world position to local (relative to group)
                    m.trailData[ti].sprite.position.set(
                        hp.x - m.group.position.x,
                        hp.y - m.group.position.y,
                        hp.z - m.group.position.z
                    );
                }
            }

            // Fade out near end of life
            var fadeStart = m.lifetime - 0.5;
            if (age > fadeStart) {
                var fadeFrac = 1 - (age - fadeStart) / 0.5;
                m.head.material.opacity = fadeFrac;
                for (var fi = 0; fi < m.trailData.length; fi++) {
                    var baseFrac = (fi + 1) / m.trailData.length;
                    m.trailData[fi].sprite.material.opacity = 0.8 * (1 - baseFrac * 0.85) * fadeFrac;
                }
            }
        }
    }

    // ── Supernovae (Star Explosions) ────────────────────────────────────────

    function spawnSupernova(t) {
        if (supernovae.length >= 2) return;

        var glowTex = createGlowTexture();

        // Random far position
        var th = Math.random() * Math.PI * 2;
        var ph = Math.acos(2 * Math.random() - 1);
        var r  = 30 + Math.random() * 40;
        var x = r * Math.sin(ph) * Math.cos(th);
        var y = r * Math.sin(ph) * Math.sin(th);
        var z = r * Math.cos(ph);

        // Random warm color: white, blue-white, orange
        var colorChoices = [
            new THREE.Color(1.0, 1.0, 1.0),       // white
            new THREE.Color(0.7, 0.8, 1.0),       // blue-white
            new THREE.Color(1.0, 0.6, 0.2)        // orange
        ];
        var color = colorChoices[Math.floor(Math.random() * colorChoices.length)];

        var mat = new THREE.SpriteMaterial({
            map: glowTex, color: color, transparent: true,
            opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false
        });
        var sprite = new THREE.Sprite(mat);
        sprite.position.set(x, y, z);
        sprite.scale.setScalar(0.01);
        scene.add(sprite);

        var targetScale = 3 + Math.random() * 2; // 3-5
        var fadeOutDuration = 2 + Math.random() * 1; // 2-3 seconds

        supernovae.push({
            sprite: sprite,
            birthTime: t,
            expandDuration: 0.3,
            fadeOutDuration: fadeOutDuration,
            targetScale: targetScale,
            phase: 'expand', // 'expand', 'flash', 'fade'
            alive: true
        });
    }

    function updateSupernovae(t) {
        // Spawn check
        if (t >= nextSupernovaTime && supernovae.length < 2) {
            spawnSupernova(t);
            nextSupernovaTime = t + 5 + Math.random() * 7; // 5-12 seconds
        }

        for (var i = supernovae.length - 1; i >= 0; i--) {
            var sn = supernovae[i];
            var age = t - sn.birthTime;

            if (sn.phase === 'expand') {
                // Rapidly scale up from 0 to targetScale over 0.3 seconds
                var expandFrac = Math.min(age / sn.expandDuration, 1.0);
                // Ease out
                var easedFrac = 1 - (1 - expandFrac) * (1 - expandFrac);
                sn.sprite.scale.setScalar(sn.targetScale * easedFrac);
                sn.sprite.material.opacity = easedFrac;

                if (expandFrac >= 1.0) {
                    sn.phase = 'flash';
                    sn.flashStart = t;
                }
            } else if (sn.phase === 'flash') {
                // Brief bright flash: opacity 1 for 0.1 seconds
                var flashAge = t - sn.flashStart;
                if (flashAge < 0.1) {
                    sn.sprite.material.opacity = 1.0;
                    sn.sprite.scale.setScalar(sn.targetScale * (1 + flashAge * 3));
                } else {
                    sn.phase = 'fade';
                    sn.fadeStart = t;
                }
            } else if (sn.phase === 'fade') {
                // Slowly fade out over fadeOutDuration
                var fadeFrac = (t - sn.fadeStart) / sn.fadeOutDuration;
                if (fadeFrac >= 1.0) {
                    // Remove
                    if (sn.sprite.parent) sn.sprite.parent.remove(sn.sprite);
                    if (sn.sprite.material.map) sn.sprite.material.map.dispose();
                    sn.sprite.material.dispose();
                    supernovae.splice(i, 1);
                    continue;
                }
                sn.sprite.material.opacity = 1.0 - fadeFrac;
                // Slightly continue expanding while fading
                sn.sprite.scale.setScalar(sn.targetScale * (1.0 + fadeFrac * 0.5));
            }
        }
    }

    // ── Space Dust ──────────────────────────────────────────────────────────

    function createDust() {
        var pal = [0xC4B5FD, 0x86EFAC, 0xFCA5A5, 0x93C5FD, 0xFDE68A];
        for (var i = 0; i < 18; i++) {
            var sz = 0.03 + Math.random() * 0.06;
            var gt = Math.floor(Math.random() * 3);
            var geo = gt === 0 ? new THREE.IcosahedronGeometry(sz,0) : gt === 1 ? new THREE.OctahedronGeometry(sz,0) : new THREE.TetrahedronGeometry(sz,0);
            var gl = (i % 3 === 0);
            var mat = new THREE.MeshStandardMaterial({
                color: pal[Math.floor(Math.random()*pal.length)], roughness: gl?0.3:0.8,
                emissive: gl ? pal[Math.floor(Math.random()*pal.length)] : 0x000000,
                emissiveIntensity: gl?0.5:0
            });
            if (gl) { mat.transparent = true; mat.opacity = 0.7; mat.blending = THREE.AdditiveBlending; mat.depthWrite = false; }
            var m = new THREE.Mesh(geo, mat);
            m.position.set((Math.random()-0.5)*24, (Math.random()-0.5)*14, (Math.random()-0.5)*16-4);
            m.rotation.set(Math.random()*Math.PI, Math.random()*Math.PI, 0);
            m.userData = { rx:(Math.random()-0.5)*0.01, ry:(Math.random()-0.5)*0.01, phase:Math.random()*Math.PI*2, speed:0.2+Math.random()*0.4, amp:0.15+Math.random()*0.3, baseY:m.position.y };
            scene.add(m); dustParticles.push(m);
        }
    }

    // ── Labels ──────────────────────────────────────────────────────────────

    function createLabels() {
        if (!labelsEl) return;
        labelsEl.innerHTML = ''; labelEls = [];
        for (var i = 0; i < SECTIONS.length; i++) {
            var el = document.createElement('div');
            el.className = 'home-3d-label';
            el.textContent = SECTIONS[i].name;
            labelsEl.appendChild(el); labelEls.push(el);
        }
    }

    function updateLabels() {
        if (!labelsEl || !camera) return;
        var w = containerEl.clientWidth, h = containerEl.clientHeight;
        var v = new THREE.Vector3();
        for (var i = 0; i < planets.length; i++) {
            var p = planets[i];
            v.copy(p.position); v.y -= 1.2;
            v.project(camera);
            var sx = (v.x * 0.5 + 0.5) * w;
            var sy = (v.y * -0.5 + 0.5) * h;
            var dist = camera.position.distanceTo(p.position);
            var fade = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(dist, orbit.radius - 10, orbit.radius + 12, 1.0, 0.25), 0.25, 1.0);
            labelEls[i].style.transform = 'translate(-50%,-50%) translate(' + sx + 'px,' + sy + 'px)';
            labelEls[i].style.opacity = fade;
            labelEls[i].classList.toggle('active', hoveredPlanet === p);
        }
    }

    // ── Find planet group from raycasted child ──────────────────────────────

    function findPlanetGroup(obj) {
        while (obj) {
            if (obj.userData && obj.userData.page) return obj;
            obj = obj.parent;
        }
        return null;
    }

    // ── Animation ───────────────────────────────────────────────────────────

    var lastFrameTime = 0;

    function animate() {
        if (!isActive) return;
        animId = requestAnimationFrame(animate);
        var t = performance.now() * 0.001;
        var dt = Math.min(t - lastFrameTime, 0.05); // cap delta to avoid huge jumps
        lastFrameTime = t;

        // Zoom transition overrides normal camera
        if (isZooming) {
            updateZoom(t);
        } else {
            // Smooth orbit camera
            orbit.theta  += (orbit.targetTheta  - orbit.theta)  * 0.08;
            orbit.phi    += (orbit.targetPhi    - orbit.phi)    * 0.08;
            orbit.radius += (orbit.targetRadius - orbit.radius) * 0.08;
            mouseLerp.x  += (mouseTarget.x - mouseLerp.x) * 0.03;
            mouseLerp.y  += (mouseTarget.y - mouseLerp.y) * 0.03;

            var r = orbit.radius;
            var sp = Math.sin(orbit.phi), cp = Math.cos(orbit.phi);
            var st = Math.sin(orbit.theta), ct = Math.cos(orbit.theta);
            camera.position.x = r * sp * st + mouseLerp.x * 0.8;
            camera.position.y = r * cp      + mouseLerp.y * 0.4;
            camera.position.z = r * sp * ct;
            camera.lookAt(0, 0, 0);
        }

        // Sun - multiple sine waves for flickering/pulsing
        if (sun) {
            sun.rotation.y = t * 0.15;
            var flicker = 0.9
                + Math.sin(t * 0.5) * 0.15
                + Math.sin(t * 1.3) * 0.08
                + Math.sin(t * 3.7) * 0.04
                + Math.sin(t * 7.1) * 0.02;
            sun.material.emissiveIntensity = flicker;
        }

        // Sun corona - animate opacity and slight rotation
        if (sunCorona) {
            sunCorona.rotation.y = t * 0.1;
            sunCorona.rotation.x = t * 0.07;
            sunCorona.material.opacity = 0.2 + Math.sin(t * 0.8) * 0.08 + Math.sin(t * 2.1) * 0.04;
        }

        // Sun glows - layered animation
        if (sunGlowCore) {
            sunGlowCore.scale.setScalar(4.5 + Math.sin(t * 0.7) * 0.5 + Math.sin(t * 1.9) * 0.3);
            sunGlowCore.material.opacity = 0.55 + Math.sin(t * 0.9) * 0.1;
        }
        if (sunGlow) {
            sunGlow.scale.setScalar(7.5 + Math.sin(t * 0.4) * 0.8 + Math.sin(t * 1.1) * 0.4);
            sunGlow.material.opacity = 0.3 + Math.sin(t * 0.6) * 0.08;
        }
        if (sunGlowOuter) {
            sunGlowOuter.scale.setScalar(13 + Math.sin(t * 0.3) * 1.5 + Math.sin(t * 0.8) * 0.6);
            sunGlowOuter.material.opacity = 0.12 + Math.sin(t * 0.5) * 0.04;
        }

        // Solar flares - erratic orbiting around the sun
        for (var fi = 0; fi < solarFlares.length; fi++) {
            var flare = solarFlares[fi];
            var fd = flare.userData;
            fd.theta += fd.speedTheta * dt;
            fd.phi += fd.speedPhi * dt;
            // Add some wobble
            var wobble = Math.sin(t * fd.wobbleSpeed + fd.wobblePhase) * fd.wobbleAmp;
            var fRadius = fd.orbitRadius + wobble;
            var fPhi = fd.phi;
            var fTheta = fd.theta;
            flare.position.x = fRadius * Math.cos(fPhi) * Math.cos(fTheta);
            flare.position.y = fRadius * Math.sin(fPhi);
            flare.position.z = fRadius * Math.cos(fPhi) * Math.sin(fTheta);
            // Flicker opacity
            flare.material.opacity = (0.3 + Math.random() * 0.4) * (0.6 + Math.sin(t * 4 + fi) * 0.4);
        }

        // Planets orbit
        for (var i = 0; i < planets.length; i++) {
            var p = planets[i], d = p.userData;
            var angle = d.startAngle + t * d.orbSpeed;
            var lx = d.orbR * Math.cos(angle), lz = d.orbR * Math.sin(angle);
            p.position.x = lx;
            p.position.y = lz * Math.sin(d.orbTilt);
            p.position.z = lz * Math.cos(d.orbTilt);

            // Face camera but with a continuous slow spin so all sides are visible
            p.lookAt(camera.position);
            p.rotateY(Math.PI);          // flip front face toward camera
            p.rotateY(t * 0.5 + i * 1.5); // continuous spin
            p.rotateX(Math.sin(t * 0.4 + i * 1.2) * 0.12); // gentle tilt

            // Scale lerp
            d.scaleCurrent += (d.scaleTarget - d.scaleCurrent) * 0.1;
            p.scale.setScalar(d.logoScale * d.scaleCurrent);

            // Glow follows
            var g = planetGlows[i], gd = g.userData;
            g.position.copy(p.position);
            gd.opacityCurrent += (gd.opacityTarget - gd.opacityCurrent) * 0.08;
            gd.scaleCurrent   += (gd.scaleTarget   - gd.scaleCurrent)   * 0.08;
            g.material.opacity = gd.opacityCurrent;
            g.scale.setScalar(gd.scaleCurrent);
            if (hoveredPlanet === p) g.scale.setScalar(gd.scaleCurrent * (1 + Math.sin(t * 3) * 0.06));
        }

        // Dust
        for (var j = 0; j < dustParticles.length; j++) {
            var dp = dustParticles[j], dd = dp.userData;
            dp.rotation.x += dd.rx; dp.rotation.y += dd.ry;
            dp.position.y = dd.baseY + Math.sin(t * dd.speed + dd.phase) * dd.amp;
        }

        if (starField) starField.rotation.y = t * 0.002;

        // Update new effects
        updateTwinklingStars(t);
        updateMeteors(t, dt);
        updateSupernovae(t);

        // Raycast (recursive into groups)
        raycaster.setFromCamera(mouse, camera);
        var hits = raycaster.intersectObjects(planets, true);
        var newHov = hits.length > 0 ? findPlanetGroup(hits[0].object) : null;

        if (newHov !== hoveredPlanet) {
            if (hoveredPlanet) {
                hoveredPlanet.userData.scaleTarget = 1;
                var oi = hoveredPlanet.userData.idx;
                planetGlows[oi].userData.opacityTarget = planetGlows[oi].userData.baseOpacity;
                planetGlows[oi].userData.scaleTarget   = planetGlows[oi].userData.baseScale;
            }
            if (newHov) {
                newHov.userData.scaleTarget = 1.3;
                var ni = newHov.userData.idx;
                planetGlows[ni].userData.opacityTarget = 0.45;
                planetGlows[ni].userData.scaleTarget   = planetGlows[ni].userData.baseScale * 1.5;
            }
            hoveredPlanet = newHov;
            renderer.domElement.style.cursor = hoveredPlanet ? 'pointer' : '';
        }

        updateLabels();
        renderer.render(scene, camera);
    }

    // ── Events ──────────────────────────────────────────────────────────────

    function onMouseMove(e) {
        var rect = containerEl.getBoundingClientRect();
        mouse.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;

        if (orbit.isDragging) {
            var dx = e.clientX - orbit.lastX;
            var dy = e.clientY - orbit.lastY;
            orbit.targetTheta -= dx * 0.005;
            orbit.targetPhi = Math.max(0.3, Math.min(Math.PI - 0.3, orbit.targetPhi - dy * 0.005));
            orbit.lastX = e.clientX;
            orbit.lastY = e.clientY;
        } else {
            mouseTarget.x = (e.clientX / window.innerWidth)  * 2 - 1;
            mouseTarget.y = (e.clientY / window.innerHeight) * 2 - 1;
        }
    }

    function onMouseDown(e) {
        if (e.button === 2) {
            orbit.isDragging = true;
            orbit.lastX = e.clientX;
            orbit.lastY = e.clientY;
            e.preventDefault();
        }
    }

    function onMouseUp(e) {
        if (e.button === 2) orbit.isDragging = false;
    }

    function onContextMenu(e) { e.preventDefault(); }

    function onWheel(e) {
        e.preventDefault();
        orbit.targetRadius = Math.max(8, Math.min(55, orbit.targetRadius + e.deltaY * 0.025));
    }

    // ── Zoom Transition ─────────────────────────────────────────────────

    function createTransitionOverlay() {
        if (transitionOverlay) return transitionOverlay;
        transitionOverlay = document.createElement('div');
        transitionOverlay.style.cssText = 'position:fixed;inset:0;z-index:999;background:rgba(10,10,20,0);pointer-events:none;transition:none;';
        document.body.appendChild(transitionOverlay);
        return transitionOverlay;
    }

    function startZoomTo(planet) {
        if (isZooming || !planet) return;
        isZooming = true;
        zoomTarget = planet;
        zoomPage = planet.userData.page;
        zoomStartTime = performance.now() * 0.001;
        zoomStartPos = { x: camera.position.x, y: camera.position.y, z: camera.position.z };

        createTransitionOverlay();
    }

    function updateZoom(t) {
        if (!isZooming) return;

        var elapsed = t - zoomStartTime;
        var progress = Math.min(elapsed / zoomDuration, 1.0);

        // Ease in-out cubic
        var ease = progress < 0.5
            ? 4 * progress * progress * progress
            : 1 - Math.pow(-2 * progress + 2, 3) / 2;

        // Recompute end position based on current planet position (it orbits)
        var px = zoomTarget.position.x, py = zoomTarget.position.y, pz = zoomTarget.position.z;
        var dx = zoomStartPos.x - px, dy = zoomStartPos.y - py, dz = zoomStartPos.z - pz;
        var dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var closeDist = 1.5;
        var ex = px + (dx / dist) * closeDist;
        var ey = py + (dy / dist) * closeDist;
        var ez = pz + (dz / dist) * closeDist;

        // Interpolate camera position
        camera.position.x = zoomStartPos.x + (ex - zoomStartPos.x) * ease;
        camera.position.y = zoomStartPos.y + (ey - zoomStartPos.y) * ease;
        camera.position.z = zoomStartPos.z + (ez - zoomStartPos.z) * ease;

        // Look at the planet (not origin)
        camera.lookAt(px, py, pz);

        // Fade overlay in during last 40% of zoom
        if (transitionOverlay && progress > 0.6) {
            var fadeProg = (progress - 0.6) / 0.4;
            transitionOverlay.style.background = 'rgba(10,10,20,' + fadeProg.toFixed(3) + ')';
        }

        // Done
        if (progress >= 1.0) {
            var page = zoomPage;
            // Reset zoom state
            isZooming = false;
            zoomTarget = null;
            zoomPage = null;

            // Navigate after a tiny delay for the full fade
            setTimeout(function () {
                if (typeof App !== 'undefined' && App.navigateTo) {
                    App.navigateTo(page);
                }
                // Fade overlay back out
                if (transitionOverlay) {
                    transitionOverlay.style.transition = 'background 0.4s ease';
                    transitionOverlay.style.background = 'rgba(10,10,20,0)';
                    setTimeout(function () {
                        if (transitionOverlay) {
                            transitionOverlay.style.transition = 'none';
                        }
                    }, 450);
                }
            }, 50);
        }
    }

    function onClick(e) {
        if (e.button !== 0) return;
        if (isZooming) return;
        if (hoveredPlanet && typeof App !== 'undefined' && App.navigateTo) {
            startZoomTo(hoveredPlanet);
        }
    }

    function onTouch(e) {
        if (isZooming) return;
        var touch = e.touches[0];
        var rect = containerEl.getBoundingClientRect();
        mouse.x =  ((touch.clientX - rect.left) / rect.width)  * 2 - 1;
        mouse.y = -((touch.clientY - rect.top)  / rect.height) * 2 + 1;
        raycaster.setFromCamera(mouse, camera);
        var hits = raycaster.intersectObjects(planets, true);
        if (hits.length > 0) {
            var grp = findPlanetGroup(hits[0].object);
            if (grp) startZoomTo(grp);
        }
    }

    function onResize() {
        if (!containerEl || !camera || !renderer) return;
        var w = containerEl.clientWidth, h = containerEl.clientHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        orbit.targetRadius = baseRadius();
    }

    function bindEvents() {
        containerEl.addEventListener('mousemove', onMouseMove);
        containerEl.addEventListener('mousedown', onMouseDown);
        containerEl.addEventListener('mouseup', onMouseUp);
        containerEl.addEventListener('click', onClick);
        containerEl.addEventListener('contextmenu', onContextMenu);
        containerEl.addEventListener('wheel', onWheel, { passive: false });
        containerEl.addEventListener('touchstart', onTouch, { passive: true });
        window.addEventListener('resize', onResize);
    }

    // ── Auto-init ───────────────────────────────────────────────────────────

    function autoInit() {
        var hp = document.getElementById('home-page');
        if (hp && hp.classList.contains('active')) init();
    }

    if (document.readyState === 'loading')
        document.addEventListener('DOMContentLoaded', autoInit);
    else
        autoInit();

    return { init: init, destroy: destroy };
})();