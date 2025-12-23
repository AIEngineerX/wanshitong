/* Minimal OBJ(+MTL) WebGL viewer (no external dependencies)
 * - Orbit controls (drag to rotate, wheel to zoom, right-drag to pan)
 * - Loads OBJ, optional MTL (map_Kd) and texture
 * - Basic directional + ambient lighting
 */
(function () {
  "use strict";

  function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

  function mat4Identity() {
    return [1,0,0,0,
            0,1,0,0,
            0,0,1,0,
            0,0,0,1];
  }
  function mat4Mul(a,b){
    const o = new Array(16);
    for (let r=0;r<4;r++){
      for (let c=0;c<4;c++){
        o[r*4+c] =
          a[r*4+0]*b[0*4+c] +
          a[r*4+1]*b[1*4+c] +
          a[r*4+2]*b[2*4+c] +
          a[r*4+3]*b[3*4+c];
      }
    }
    return o;
  }
  function mat4Perspective(fovy, aspect, near, far){
    const f = 1 / Math.tan(fovy/2);
    const nf = 1/(near - far);
    return [
      f/aspect,0,0,0,
      0,f,0,0,
      0,0,(far+near)*nf,-1,
      0,0,(2*far*near)*nf,0
    ];
  }
  function vec3Normalize(v){
    const l=Math.hypot(v[0],v[1],v[2])||1;
    return [v[0]/l,v[1]/l,v[2]/l];
  }
  function vec3Cross(a,b){
    return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  }
  function vec3Sub(a,b){ return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]; }
  function vec3Add(a,b){ return [a[0]+b[0],a[1]+b[1],a[2]+b[2]]; }
  function vec3Scale(a,s){ return [a[0]*s,a[1]*s,a[2]*s]; }

  function mat4LookAt(eye, target, up){
    const z = vec3Normalize(vec3Sub(eye, target)); // forward
    const x = vec3Normalize(vec3Cross(up, z));
    const y = vec3Cross(z, x);
    return [
      x[0], y[0], z[0], 0,
      x[1], y[1], z[1], 0,
      x[2], y[2], z[2], 0,
      -(x[0]*eye[0] + x[1]*eye[1] + x[2]*eye[2]),
      -(y[0]*eye[0] + y[1]*eye[1] + y[2]*eye[2]),
      -(z[0]*eye[0] + z[1]*eye[1] + z[2]*eye[2]),
      1
    ];
  }

  function compileShader(gl, type, src){
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)){
      const info = gl.getShaderInfoLog(sh) || "Unknown shader error";
      gl.deleteShader(sh);
      throw new Error(info);
    }
    return sh;
  }
  function createProgram(gl, vsSrc, fsSrc){
    const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)){
      const info = gl.getProgramInfoLog(p) || "Unknown link error";
      gl.deleteProgram(p);
      throw new Error(info);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    return p;
  }

  async function fetchText(url){
    const r = await fetch(url, {cache:"no-store"});
    if (!r.ok) throw new Error(`Failed to fetch ${url} (${r.status})`);
    return await r.text();
  }

  async function loadImage(url){
    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load image ${url}`));
      img.src = url;
    });
  }

  function parseMTL(text){
    // Minimal: reads map_Kd from first material
    const lines = text.split(/\r?\n/);
    let mapKd = null;
    for (const ln of lines){
      const l = ln.trim();
      if (!l || l.startsWith("#")) continue;
      const parts = l.split(/\s+/);
      const key = parts[0].toLowerCase();
      if (key === "map_kd" && parts.length >= 2){
        mapKd = parts.slice(1).join(" ");
        // strip options like -s etc (best-effort)
        mapKd = mapKd.replace(/^[-\w]+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+/i, "");
        mapKd = mapKd.replace(/^[-\w]+\s+[-\d.]+\s+[-\d.]+\s+/i, "");
        mapKd = mapKd.replace(/^[-\w]+\s+[-\d.]+\s+/i, "");
        mapKd = mapKd.trim();
        break;
      }
    }
    return { mapKd };
  }

  function parseOBJ(text){
    const positions = [[0,0,0]];
    const texcoords = [[0,0]];
    const normals = [[0,0,1]];
    const outPos = [];
    const outUV = [];
    const outNor = [];

    const lines = text.split(/\r?\n/);

    function addVertex(v){
      const [vi, ti, ni] = v;
      const p = positions[vi] || [0,0,0];
      const t = texcoords[ti] || [0,0];
      const n = normals[ni] || [0,0,1];
      outPos.push(p[0],p[1],p[2]);
      outUV.push(t[0],1 - t[1]);
      outNor.push(n[0],n[1],n[2]);
    }

    for (const ln of lines){
      const l = ln.trim();
      if (!l || l.startsWith("#")) continue;
      const parts = l.split(/\s+/);
      const key = parts[0];
      if (key === "v"){
        positions.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
      } else if (key === "vt"){
        texcoords.push([parseFloat(parts[1]), parseFloat(parts[2])]);
      } else if (key === "vn"){
        normals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
      } else if (key === "f"){
        // supports v, v/vt, v//vn, v/vt/vn
        const verts = parts.slice(1).map(tok => {
          const seg = tok.split("/");
          const vi = parseInt(seg[0],10);
          const ti = seg[1] ? parseInt(seg[1],10) : 0;
          const ni = seg[2] ? parseInt(seg[2],10) : (seg[1]==="" ? parseInt(seg[2],10) : 0);
          return [vi < 0 ? positions.length + vi : vi,
                  ti < 0 ? texcoords.length + ti : ti,
                  ni < 0 ? normals.length + ni : ni];
        });
        // triangulate fan
        for (let i=1;i<verts.length-1;i++){
          addVertex(verts[0]);
          addVertex(verts[i]);
          addVertex(verts[i+1]);
        }
      }
    }

    // compute bounds
    let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
    for (let i=0;i<outPos.length;i+=3){
      const x=outPos[i], y=outPos[i+1], z=outPos[i+2];
      minX=Math.min(minX,x); minY=Math.min(minY,y); minZ=Math.min(minZ,z);
      maxX=Math.max(maxX,x); maxY=Math.max(maxY,y); maxZ=Math.max(maxZ,z);
    }
    const center=[(minX+maxX)/2,(minY+maxY)/2,(minZ+maxZ)/2];
    const size=[maxX-minX,maxY-minY,maxZ-minZ];
    const radius=Math.max(size[0],size[1],size[2]) * 0.6 || 1;

    return {
      position: new Float32Array(outPos),
      normal: new Float32Array(outNor),
      uv: new Float32Array(outUV),
      center, radius
    };
  }

  function createTexture(gl, img){
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.bindTexture(gl.TEXTURE_2D, null);
    return tex;
  }

  function setStatus(el, msg){
    if (!el) return;
    el.textContent = msg;
    el.style.display = msg ? "block" : "none";
  }

  window.initWanShiViewer = async function initWanShiViewer(opts){
    const canvas = document.getElementById(opts.canvasId || "threeCanvas");
    const statusEl = opts.statusId ? document.getElementById(opts.statusId) : null;

    if (!canvas){
      setStatus(statusEl, "3D canvas not found.");
      return;
    }

    const gl = canvas.getContext("webgl", {alpha:true, antialias:true});
    if (!gl){
      setStatus(statusEl, "WebGL not available in this browser.");
      return;
    }

    const vsSrc = `
      attribute vec3 aPos;
      attribute vec3 aNor;
      attribute vec2 aUV;
      uniform mat4 uMVP;
      uniform mat4 uMV;
      varying vec3 vNor;
      varying vec2 vUV;
      varying vec3 vPos;
      void main(){
        vec4 mv = uMV * vec4(aPos, 1.0);
        vPos = mv.xyz;
        vNor = mat3(uMV) * aNor;
        vUV = aUV;
        gl_Position = uMVP * vec4(aPos, 1.0);
      }
    `;
    const fsSrc = `
      precision mediump float;
      varying vec3 vNor;
      varying vec2 vUV;
      uniform sampler2D uTex;
      uniform bool uHasTex;
      uniform vec3 uLightDir;
      void main(){
        vec3 n = normalize(vNor);
        float diff = max(dot(n, normalize(uLightDir)), 0.0);
        float amb = 0.35;
        vec3 base = uHasTex ? texture2D(uTex, vUV).rgb : vec3(0.9, 0.85, 0.75);
        vec3 col = base * (amb + diff * 0.9);
        gl_FragColor = vec4(col, 1.0);
      }
    `;
    let program;
    try{
      program = createProgram(gl, vsSrc, fsSrc);
    } catch(e){
      setStatus(statusEl, "Shader error: " + e.message);
      return;
    }
    gl.useProgram(program);

    const loc = {
      aPos: gl.getAttribLocation(program, "aPos"),
      aNor: gl.getAttribLocation(program, "aNor"),
      aUV:  gl.getAttribLocation(program, "aUV"),
      uMVP: gl.getUniformLocation(program, "uMVP"),
      uMV:  gl.getUniformLocation(program, "uMV"),
      uTex: gl.getUniformLocation(program, "uTex"),
      uHasTex: gl.getUniformLocation(program, "uHasTex"),
      uLightDir: gl.getUniformLocation(program, "uLightDir"),
    };

    setStatus(statusEl, "Loading 3D model…");

    let obj, mtl, mesh, tex = null;
    try{
      obj = await fetchText(opts.objPath);
      mesh = parseOBJ(obj);
      if (opts.mtlPath){
        mtl = await fetchText(opts.mtlPath);
        const m = parseMTL(mtl);
        if (m.mapKd){
          const base = opts.mtlPath.substring(0, opts.mtlPath.lastIndexOf("/") + 1);
          const texUrl = base + m.mapKd;
          const img = await loadImage(texUrl);
          tex = createTexture(gl, img);
        }
      }
    } catch(e){
      console.error(e);
      setStatus(statusEl, "3D viewer failed to load: " + e.message);
      return;
    }

    // buffers
    function makeVBO(data, attribLoc, size){
      const b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(attribLoc);
      gl.vertexAttribPointer(attribLoc, size, gl.FLOAT, false, 0, 0);
      return b;
    }
    const posB = makeVBO(mesh.position, loc.aPos, 3);
    const norB = makeVBO(mesh.normal, loc.aNor, 3);
    const uvB  = makeVBO(mesh.uv, loc.aUV, 2);

    const vertexCount = mesh.position.length / 3;

    // texture setup
    gl.activeTexture(gl.TEXTURE0);
    if (tex){
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(loc.uTex, 0);
      gl.uniform1i(loc.uHasTex, 1);
    } else {
      gl.uniform1i(loc.uHasTex, 0);
    }

    // camera / controls
    let target = mesh.center.slice();
    let radius = mesh.radius;
    let theta = Math.PI * 0.15;
    let phi = Math.PI * 0.35;
    let dist = radius * 2.6;

    
  // Interaction: pointer drag to rotate, right-drag (or Shift+drag) to pan, wheel to zoom.
  // Uses Pointer Events so it works on desktop + mobile consistently.
  canvas.style.touchAction = "none";

  let activePointerId = null;
  let isDragging = false;
  let isPanning = false;
  let lastX = 0;
  let lastY = 0;

  function beginPointer(e) {
    // Only track one pointer at a time.
    if (activePointerId !== null) return;

    activePointerId = e.pointerId;
    try { canvas.setPointerCapture(activePointerId); } catch (_) {}

    // Left button => rotate. Right button or Shift => pan.
    // On touch, default to rotate.
    const isRightButton = (typeof e.button === "number" && e.button === 2);
    isPanning = isRightButton || e.shiftKey;
    isDragging = !isPanning;

    lastX = e.clientX;
    lastY = e.clientY;

    e.preventDefault();
  }

  function movePointer(e) {
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;

    const rotSpeed = 0.006;
    const panSpeed = 0.0025 * camera.distance;

    if (isDragging) {
      camera.theta -= dx * rotSpeed;
      camera.phi -= dy * rotSpeed;
      camera.phi = Math.max(0.12, Math.min(Math.PI - 0.12, camera.phi));
      camera.updateEye();
      render();
    } else if (isPanning) {
      // Pan in camera local space (screen-aligned).
      const right = normalize(cross(camera.eye, camera.up));
      const up = normalize(camera.up);

      const moveRight = scale(right, -dx * panSpeed);
      const moveUp = scale(up, dy * panSpeed);

      camera.target = add(camera.target, add(moveRight, moveUp));
      camera.updateEye();
      render();
    }

    e.preventDefault();
  }

  function endPointer(e) {
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    try { canvas.releasePointerCapture(activePointerId); } catch (_) {}
    activePointerId = null;
    isDragging = false;
    isPanning = false;

    e.preventDefault();
  }

  canvas.addEventListener("pointerdown", beginPointer);
  canvas.addEventListener("pointermove", movePointer);
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", endPointer);

  // Disable context menu so right-drag can pan.
  canvas.addEventListener("contextmenu", (e) => e.preventDefault());

  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    // Zoom: wheel down => zoom out; wheel up => zoom in.
    const delta = Math.sign(e.deltaY);
    camera.distance *= (delta > 0) ? 1.08 : 0.92;
    camera.distance = Math.max(0.6, Math.min(12, camera.distance));
    camera.updateEye();
    render();
  }, { passive: false });


  addEventListener("resize", resize);

    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);

    setStatus(statusEl, ""); // clear

    function render(){
      const [w,h] = resize();
      gl.clearColor(0,0,0,0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const aspect = w / h;
      const proj = mat4Perspective(45*Math.PI/180, aspect, 0.01, 1000);
      const eye = getEye();
      const view = mat4LookAt(eye, target, [0,1,0]);

      // model transform: center to origin, mild scale
      const T = mat4Identity();
      // translate by -center (baked via MV by shifting target, but keep stable)
      // We'll do nothing here; OBJ coordinates already used and target is center.

      const mv = view; // no model matrix
      const mvp = mat4Mul(proj, mv);

      gl.uniformMatrix4fv(loc.uMV, false, new Float32Array(mv));
      gl.uniformMatrix4fv(loc.uMVP, false, new Float32Array(mvp));

      gl.uniform3fv(loc.uLightDir, new Float32Array(vec3Normalize([0.6, 0.9, 0.4])));

      gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  };
})();
