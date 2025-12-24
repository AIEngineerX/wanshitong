// Wan Shi Tong GLB Viewer (Three.js)
// Lightweight, reliable GLB viewer for Netlify static deploys.
// Exposes initWanShiViewer({canvasId,statusId,glbPath})

import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { GLTFLoader } from "https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/OrbitControls.js";

function safeText(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

export function initWanShiViewer(opts) {
  const canvas = document.getElementById(opts.canvasId);
  if (!canvas) {
    safeText(opts.statusId, "3D viewer error: canvas not found.");
    return;
  }

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
  camera.position.set(0.6, 0.6, 2.2);

  // Lights: warm + readable
  scene.add(new THREE.HemisphereLight(0xffffff, 0x222222, 1.0));
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(3, 6, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.55);
  rim.position.set(-4, 2, -4);
  scene.add(rim);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.85;
  controls.minDistance = 0.6;
  controls.maxDistance = 12;
  controls.enablePan = false;

  // Resize to CSS size
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(rect.width));
    const h = Math.max(1, Math.floor(rect.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener("resize", resize);

  let model = null;
  let baseCam = null;
  let baseTarget = null;

  const loader = new GLTFLoader();
  const glbPath = opts.glbPath || "models/wan_shi_tong.glb";
  safeText(opts.statusId, "Loading 3D model...");

  loader.load(
    glbPath,
    (gltf) => {
      model = gltf.scene;
      scene.add(model);

      // Improve materials (ensure correct color space)
      model.traverse((o) => {
        if (o.isMesh && o.material) {
          if (o.material.map) o.material.map.colorSpace = THREE.SRGBColorSpace;
          o.castShadow = false;
          o.receiveShadow = false;
        }
      });

      // Center + frame camera
      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);

      // Recenter model at origin
      model.position.sub(center);

      // Frame camera distance based on FOV
      const fov = camera.fov * (Math.PI / 180);
      let dist = Math.abs((maxDim / 2) / Math.tan(fov / 2));
      dist *= 1.55;

      // Slightly lift camera to show face
      camera.position.set(0, Math.max(0.15, maxDim * 0.12), dist);
      controls.target.set(0, 0, 0);
      controls.update();

      baseCam = camera.position.clone();
      baseTarget = controls.target.clone();

      safeText(opts.statusId, "Loaded. Drag to rotate • scroll to zoom • double‑click to reset.");
    },
    (xhr) => {
      if (xhr && xhr.total) {
        const pct = Math.round((xhr.loaded / xhr.total) * 100);
        safeText(opts.statusId, `Loading 3D model... ${pct}%`);
      }
    },
    (err) => {
      console.error("GLB load error:", err);
      safeText(opts.statusId, "Failed to load 3D model. Check file path and deploy folder structure.");
    }
  );

  // Double-click reset
  canvas.addEventListener("dblclick", () => {
    if (!baseCam || !baseTarget) return;
    camera.position.copy(baseCam);
    controls.target.copy(baseTarget);
    controls.update();
  });

  // Render loop
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    if (model) model.rotation.y += 0.0015; // subtle idle
    renderer.render(scene, camera);
  }
  animate();
}

// Make it accessible to the existing inline bootstrapper
window.initWanShiViewer = initWanShiViewer;
