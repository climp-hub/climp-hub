import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Calendar3DVisualization {
  constructor(containerElement, options = {}) {
    this.container = containerElement;
    this.options = {
      onCubeHover: options.onCubeHover || null,
      onCubeLeave: options.onCubeLeave || null,
      ...options,
    };

    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2(-999, -999);

    this.cubesGroup = null;
    this.platformMesh = null;
    this.labelsGroup = null;
    this.cubeMeshes = [];
    this.hoveredCube = null;

    this.animationFrameId = null;
    this.isAutoRotating = false;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Dimensions
    this.cubeSize = 0.82;
    this.gap = 0.24;
    this.step = this.cubeSize + this.gap; // 1.06

    // Heights by intensity level 0..4
    this.heights = [0.12, 0.45, 0.90, 1.45, 2.20];

    // Shared materials
    this.materials = [];
    this.geometries = [];
    this.hoverMaterial = null;

    this.init();
  }

  static isWebGLAvailable() {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(
        window.WebGLRenderingContext &&
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
      );
    } catch {
      return false;
    }
  }

  init() {
    const width = this.container.clientWidth || 900;
    const height = this.container.clientHeight || 560;

    // 1. Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0f19);

    // 2. Camera (Isometric-angled Perspective)
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    this.defaultCameraPos = new THREE.Vector3(26, 32, 42);
    this.camera.position.copy(this.defaultCameraPos);

    // 3. Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.container.appendChild(this.renderer.domElement);

    // 4. OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2.05; // Prevent flipping beneath floor
    this.controls.minDistance = 15;
    this.controls.maxDistance = 85;
    this.controls.autoRotate = false;
    this.controls.autoRotateSpeed = 0.6;
    this.controls.target.set(0, 0, 0);

    // 5. Lighting
    this.setupLighting();

    // 6. Shared Materials
    this.setupMaterials();

    // 7. Event listeners
    this.bindEvents();

    // 8. Render loop
    this.animate();
  }

  setupLighting() {
    // Ambient soft fill
    const ambient = new THREE.AmbientLight(0x64748b, 0.85);
    this.scene.add(ambient);

    // Main directional sunlight for specular highlights and depth
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.8);
    dirLight.position.set(30, 45, 25);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 10;
    dirLight.shadow.camera.far = 120;
    dirLight.shadow.camera.left = -35;
    dirLight.shadow.camera.right = 35;
    dirLight.shadow.camera.top = 25;
    dirLight.shadow.camera.bottom = -25;
    dirLight.shadow.bias = -0.0005;
    this.scene.add(dirLight);

    // Rim / backlight for crisp silhouette
    const backLight = new THREE.DirectionalLight(0x1e3a8a, 0.7);
    backLight.position.set(-30, 20, -30);
    this.scene.add(backLight);

    // Subtle green bounce glow
    const greenBounce = new THREE.PointLight(0x22c55e, 0.45, 60);
    greenBounce.position.set(0, 10, 0);
    this.scene.add(greenBounce);
  }

  setupMaterials() {
    // Colors inspired by GitHub dark theme contributions
    // 0: Dark slate base
    // 1: Emerald deep green
    // 2: GitHub forest green
    // 3: Bright green
    // 4: Vibrant neon green with emissive glow
    this.materials = [
      new THREE.MeshStandardMaterial({
        color: 0x161b22,
        roughness: 0.85,
        metalness: 0.05,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x0e4429,
        roughness: 0.55,
        metalness: 0.1,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x006d32,
        roughness: 0.4,
        metalness: 0.15,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x26a641,
        roughness: 0.3,
        metalness: 0.2,
        emissive: 0x0f3f18,
        emissiveIntensity: 0.3,
      }),
      new THREE.MeshStandardMaterial({
        color: 0x39d353,
        roughness: 0.2,
        metalness: 0.2,
        emissive: 0x1e8e35,
        emissiveIntensity: 0.65,
      }),
    ];

    // Hover highlight material
    this.hoverMaterial = new THREE.MeshStandardMaterial({
      color: 0x56ff89,
      roughness: 0.15,
      metalness: 0.3,
      emissive: 0x22c55e,
      emissiveIntensity: 0.9,
    });

    // Box geometries for each height level
    this.geometries = this.heights.map(h => {
      const geo = new THREE.BoxGeometry(this.cubeSize, h, this.cubeSize);
      geo.translate(0, h / 2, 0); // anchor at base
      return geo;
    });
  }

  renderCalendar(calendarData) {
    if (!calendarData || !calendarData.weeks) return;

    this.clearCalendar();

    const weeks = calendarData.weeks;
    const numWeeks = weeks.length;
    const numDays = 7;

    const totalWidth = numWeeks * this.step;
    const totalDepth = numDays * this.step;

    const originX = -totalWidth / 2 + this.step / 2;
    const originZ = -totalDepth / 2 + this.step / 2;

    // 1. Baseboard platform
    const platformW = totalWidth + 3.0;
    const platformD = totalDepth + 3.6;
    const platformH = 0.4;

    const platGeo = new THREE.BoxGeometry(platformW, platformH, platformD);
    platGeo.translate(0, -platformH / 2, 0);
    const platMat = new THREE.MeshStandardMaterial({
      color: 0x0d1117,
      roughness: 0.9,
      metalness: 0.1,
    });
    this.platformMesh = new THREE.Mesh(platGeo, platMat);
    this.platformMesh.receiveShadow = true;
    this.scene.add(this.platformMesh);

    // Platform subtle border frame
    const frameGeo = new THREE.BoxGeometry(platformW + 0.1, 0.05, platformD + 0.1);
    frameGeo.translate(0, 0.01, 0);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x21262d,
      roughness: 0.8,
    });
    const frameMesh = new THREE.Mesh(frameGeo, frameMat);
    this.scene.add(frameMesh);

    // 2. Voxel Cubes
    this.cubesGroup = new THREE.Group();
    this.cubeMeshes = [];

    for (let c = 0; c < numWeeks; c++) {
      const week = weeks[c];
      const days = week.contributionDays || [];

      for (let r = 0; r < days.length; r++) {
        const day = days[r];
        const intensity = Math.min(4, Math.max(0, day.intensity ?? 0));

        const geo = this.geometries[intensity];
        const mat = this.materials[intensity];

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(originX + c * this.step, 0, originZ + r * this.step);
        mesh.castShadow = true;
        mesh.receiveShadow = true;

        // Attach day metadata for interaction
        mesh.userData = {
          date: day.date,
          contributionCount: day.contributionCount,
          intensity,
          weekday: day.weekday,
          col: c,
          row: r,
          defaultMaterial: mat,
          defaultScaleY: 1,
        };

        this.cubesGroup.add(mesh);
        this.cubeMeshes.push(mesh);
      }
    }

    this.scene.add(this.cubesGroup);

    // 3. Month & Weekday Labels
    this.buildLabels(calendarData, originX, originZ, totalDepth);

    // Adjust camera target
    this.controls.target.set(0, 0.5, 0);
    this.controls.update();
  }

  buildLabels(calendarData, originX, originZ, totalDepth) {
    this.labelsGroup = new THREE.Group();

    // Weekday labels: Mon (row 1), Wed (row 3), Fri (row 5)
    const weekdayLabels = [
      { text: 'Mon', row: 1 },
      { text: 'Wed', row: 3 },
      { text: 'Fri', row: 5 },
    ];

    for (const item of weekdayLabels) {
      const sprite = this.createTextSprite(item.text, '#8b949e', 22);
      sprite.position.set(originX - 1.8, 0.1, originZ + item.row * this.step);
      sprite.scale.set(1.8, 0.9, 1);
      this.labelsGroup.add(sprite);
    }

    // Month labels along front
    const months = calendarData.months || [];
    const weeks = calendarData.weeks || [];

    for (const m of months) {
      const colIndex = weeks.findIndex(w => (w.contributionDays || []).some(d => d.date >= m.firstDay));
      const safeCol = colIndex >= 0 ? colIndex : 0;

      const sprite = this.createTextSprite(m.name, '#8b949e', 20);
      sprite.position.set(originX + safeCol * this.step, 0.1, originZ + totalDepth / 2 + 1.2);
      sprite.scale.set(1.9, 0.95, 1);
      this.labelsGroup.add(sprite);
    }

    this.scene.add(this.labelsGroup);
  }

  createTextSprite(text, color = '#8b949e', fontSize = 24) {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = color;
    ctx.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 64, 32);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;

    const spriteMat = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    });
    return new THREE.Sprite(spriteMat);
  }

  clearCalendar() {
    if (this.cubesGroup) {
      this.scene.remove(this.cubesGroup);
      this.cubesGroup = null;
    }
    if (this.platformMesh) {
      this.scene.remove(this.platformMesh);
      if (this.platformMesh.geometry) this.platformMesh.geometry.dispose();
      this.platformMesh = null;
    }
    if (this.labelsGroup) {
      this.scene.remove(this.labelsGroup);
      this.labelsGroup = null;
    }
    this.cubeMeshes = [];
    this.hoveredCube = null;
  }

  bindEvents() {
    this.onWindowResize = () => {
      const width = this.container.clientWidth;
      const height = this.container.clientHeight;
      if (width && height && this.renderer && this.camera) {
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
      }
    };
    window.addEventListener('resize', this.onWindowResize);

    const dom = this.renderer.domElement;
    this.onPointerMove = (e) => {
      const rect = dom.getBoundingClientRect();
      this.pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.checkRaycast(e.clientX, e.clientY);
    };
    dom.addEventListener('pointermove', this.onPointerMove);

    this.onPointerLeave = () => {
      this.pointer.set(-999, -999);
      this.clearHover();
    };
    dom.addEventListener('pointerleave', this.onPointerLeave);
  }

  checkRaycast(clientX, clientY) {
    if (!this.cubeMeshes.length) return;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.cubeMeshes, false);

    if (intersects.length > 0) {
      const hit = intersects[0].object;

      if (this.hoveredCube !== hit) {
        this.clearHover();
        this.hoveredCube = hit;
        hit.material = this.hoverMaterial;
        hit.scale.set(1.08, 1.15, 1.08);

        if (this.options.onCubeHover) {
          this.options.onCubeHover({
            ...hit.userData,
            clientX,
            clientY,
          });
        }
      } else if (this.options.onCubeHover) {
        // Update tooltip position
        this.options.onCubeHover({
          ...hit.userData,
          clientX,
          clientY,
        });
      }
    } else {
      this.clearHover();
    }
  }

  clearHover() {
    if (this.hoveredCube) {
      this.hoveredCube.material = this.hoveredCube.userData.defaultMaterial;
      this.hoveredCube.scale.set(1, 1, 1);
      this.hoveredCube = null;

      if (this.options.onCubeLeave) {
        this.options.onCubeLeave();
      }
    }
  }

  animate() {
    this.animationFrameId = requestAnimationFrame(() => this.animate());

    if (this.controls) {
      this.controls.update();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  // Camera control helpers
  resetCamera() {
    this.camera.position.copy(this.defaultCameraPos);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setTopDownView() {
    this.camera.position.set(0, 48, 0.1);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  setIsometricView() {
    this.resetCamera();
  }

  toggleAutoRotate() {
    this.isAutoRotating = !this.isAutoRotating;
    this.controls.autoRotate = this.isAutoRotating;
    return this.isAutoRotating;
  }

  zoomIn() {
    this.camera.position.multiplyScalar(0.85);
    this.controls.update();
  }

  zoomOut() {
    this.camera.position.multiplyScalar(1.18);
    this.controls.update();
  }

  dispose() {
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    window.removeEventListener('resize', this.onWindowResize);
    if (this.renderer?.domElement) {
      this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
      this.renderer.domElement.removeEventListener('pointerleave', this.onPointerLeave);
      this.renderer.domElement.remove();
    }

    this.clearCalendar();

    // Dispose shared geometries
    for (const geo of this.geometries) {
      geo.dispose();
    }
    // Dispose shared materials
    for (const mat of this.materials) {
      mat.dispose();
    }
    if (this.hoverMaterial) {
      this.hoverMaterial.dispose();
    }

    if (this.renderer) {
      this.renderer.dispose();
    }
  }
}

