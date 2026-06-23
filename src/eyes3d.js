// eyes3d.js — the two 3D EYES (Three.js) for EYE BEATS.
//
// Deliberately simple and CLEAN: two eyeballs floating in an acid-plasma void (no cartoon head — a
// full face read terribly). Each eye is the player's stick made flesh: the stick is the gaze, and
// the eye rotates to LOOK toward where you aim (1:1 with the stick, screen y-down) — at rest
// (centred) it stares straight back at you, the "centre it" cue. Whites go bloodshot and the pupil
// dilates as combo climbs; the eye whirls during a spin. Round glasses frame the eyes and SURGE
// with light on the FOCUS bonus (both eyes on-target at once). The 2D note/HUD overlay (render.js)
// sits on top and targets each eye's projected screen position, exposed via `.screen`.
//
// If a `models/eye.glb` is present it's loaded and used for the eyeballs instead.

import * as THREE from 'three';

const LOOK_MAX = 0.95;          // radians the eye rotates at full stick — big, obvious gaze
const EYE_R = 1.35;             // eyeball radius (world units)
const EYE_X = 3.4;              // each eye's distance left/right of centre (~29%/71% of width @16:9)

function makeCanvas(s) { const c = document.createElement('canvas'); c.width = c.height = s; return c; }

// Iris: dark limbal ring, radial fibres, a coloured base; transparent outside the disc + small
// baked pupil (the live combo-scaled pupil sits on top).
function irisTexture(hueDeg) {
  const s = 256, c = makeCanvas(s), x = c.getContext('2d');
  const cx = s / 2, cy = s / 2, R = s * 0.5;
  x.clearRect(0, 0, s, s);
  const g = x.createRadialGradient(cx, cy, R * 0.16, cx, cy, R);
  g.addColorStop(0, '#0a0a0a');
  g.addColorStop(0.20, `hsl(${hueDeg},90%,62%)`);
  g.addColorStop(0.62, `hsl(${hueDeg},95%,44%)`);
  g.addColorStop(0.93, `hsl(${(hueDeg + 30) % 360},80%,20%)`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.beginPath(); x.arc(cx, cy, R, 0, Math.PI * 2); x.fillStyle = g; x.fill();
  for (let i = 0; i < 200; i++) {
    const a = (i / 200) * Math.PI * 2 + Math.random() * 0.05;
    const r0 = R * (0.2 + Math.random() * 0.08), r1 = R * (0.55 + Math.random() * 0.42);
    x.strokeStyle = `hsla(${(hueDeg + (Math.random() * 40 - 20)) % 360},95%,${55 + Math.random() * 25 | 0}%,${0.22 + Math.random() * 0.28})`;
    x.lineWidth = 0.6 + Math.random();
    x.beginPath(); x.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); x.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1); x.stroke();
  }
  x.beginPath(); x.arc(cx, cy, R * 0.97, 0, Math.PI * 2); x.lineWidth = R * 0.06; x.strokeStyle = 'rgba(0,0,0,0.5)'; x.stroke();
  return new THREE.CanvasTexture(c);
}

// Transparent red veins from the edge — opacity driven by combo (bloodshot).
function veinsTexture() {
  const s = 512, c = makeCanvas(s), x = c.getContext('2d');
  x.clearRect(0, 0, s, s); x.lineCap = 'round';
  for (let i = 0; i < 64; i++) {
    const edge = Math.random() * Math.PI * 2;
    let px = s / 2 + Math.cos(edge) * s * 0.5, py = s / 2 + Math.sin(edge) * s * 0.5;
    const steps = 5 + (Math.random() * 7 | 0);
    x.strokeStyle = `rgba(${200 + Math.random() * 40 | 0},20,30,${0.5 + Math.random() * 0.4})`;
    x.lineWidth = 0.6 + Math.random() * 1.6;
    x.beginPath(); x.moveTo(px, py);
    let ang = edge + Math.PI + (Math.random() - 0.5);
    for (let k = 0; k < steps; k++) { ang += (Math.random() - 0.5) * 0.9; const len = 6 + Math.random() * 14; px += Math.cos(ang) * len; py += Math.sin(ang) * len; x.lineTo(px, py); }
    x.stroke();
  }
  return new THREE.CanvasTexture(c);
}

function glintTexture() {
  const s = 128, c = makeCanvas(s), x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.5, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

class Eye {
  constructor(side, hue) {
    this.side = side; this.hue = hue;
    this.group = new THREE.Group();
    this.spinGroup = new THREE.Group();
    this.group.add(this.spinGroup);

    const sclera = new THREE.Mesh(
      new THREE.SphereGeometry(EYE_R, 56, 56),
      new THREE.MeshStandardMaterial({ color: 0xf6f3ec, roughness: 0.35, metalness: 0.0 })
    );
    this.scleraMat = sclera.material; this.spinGroup.add(sclera);

    this.veins = new THREE.Mesh(
      new THREE.SphereGeometry(EYE_R * 1.004, 40, 40),
      new THREE.MeshBasicMaterial({ map: veinsTexture(), transparent: true, opacity: 0, depthWrite: false })
    );
    this.spinGroup.add(this.veins);

    const iris = new THREE.Mesh(
      new THREE.CircleGeometry(EYE_R * 0.6, 64),
      new THREE.MeshStandardMaterial({ map: irisTexture(hue), emissive: new THREE.Color().setHSL(hue / 360, 0.9, 0.4), emissiveIntensity: 0.8, transparent: true, roughness: 0.25 })
    );
    iris.material.emissiveMap = iris.material.map;
    iris.position.z = EYE_R * 0.985; this.iris = iris; this.irisMat = iris.material;
    this.spinGroup.add(iris);

    // pupil — small black disc that dilates gently with combo + a thin neon ring
    const pupil = new THREE.Group();
    pupil.add(new THREE.Mesh(new THREE.CircleGeometry(EYE_R * 0.16, 40), new THREE.MeshBasicMaterial({ color: 0x000000 })));
    const ring = new THREE.Mesh(new THREE.RingGeometry(EYE_R * 0.16, EYE_R * 0.2, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(hue / 360, 1, 0.6), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
    pupil.add(ring); pupil.position.z = EYE_R * 0.992;
    this.pupil = pupil; this.pupilRing = ring.material; this.spinGroup.add(pupil);

    // wet glint (fixed reflection near the top-left)
    const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 }));
    glint.scale.setScalar(EYE_R * 0.55); glint.position.set(-EYE_R * 0.3, EYE_R * 0.32, EYE_R * 1.02);
    this.group.add(glint);

    this.group.position.x = side === 'L' ? -EYE_X : EYE_X;
    this._yaw = 0; this._pitch = 0; this._roll = 0; this._chomp = 0; this.spinDir = 0;
  }

  update(aim, dt) {
    const tx = (aim?.x || 0), ty = (aim?.y || 0);
    const k = Math.min(1, dt * 22);
    this._yaw += (tx * LOOK_MAX - this._yaw) * k;
    this._pitch += (ty * LOOK_MAX - this._pitch) * k;   // +ty: stick down → look down (y-down)
    this._roll += this.spinDir * dt * 9;
    this.group.rotation.set(this._pitch, this._yaw, 0);
    this.spinGroup.rotation.z = this._roll;
    this._chomp *= Math.pow(0.0001, dt);
    this.group.scale.setScalar(1 + this._chomp * 0.1);
  }

  setBloodshot(f) { this.veins.material.opacity = Math.max(0, Math.min(1, f)); const p = Math.min(0.4, f * 0.4); this.scleraMat.color.setRGB(1, 1 - p, 1 - p * 0.85); }
  setPupil(s) { this.pupil.scale.setScalar(s); }
  setHue(h) { const hh = (((h % 360) + 360) % 360) / 360; this.irisMat.emissive.setHSL(hh, 0.9, 0.45); this.pupilRing.color.setHSL(hh, 1, 0.6); }
  chomp() { this._chomp = 1; }
}

export class EyeStage {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 1);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    this.camera.position.set(0, 0, 12);

    this.scene.add(new THREE.AmbientLight(0x303040, 1.2));
    this.key = new THREE.DirectionalLight(0xffffff, 1.6); this.key.position.set(0.3, 0.8, 2); this.scene.add(this.key);
    this.rimL = new THREE.PointLight(0x00f0ff, 50, 40); this.rimL.position.set(-6, 2, 3); this.scene.add(this.rimL);
    this.rimR = new THREE.PointLight(0xff00e0, 50, 40); this.rimR.position.set(6, -1, 3); this.scene.add(this.rimR);

    this._addBackdrop();
    this.L = new Eye('L', 192); this.R = new Eye('R', 320);
    this.scene.add(this.L.group); this.scene.add(this.R.group);
    this._addGlasses();

    this.screen = { L: { x: 0, y: 0, r: 60 }, R: { x: 0, y: 0, r: 60 } };
    this._t = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this._tryLoadModel();
  }

  // A dark, slow acid-plasma void behind the eyes (kept dim so the eyes pop).
  _addBackdrop() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { t: { value: 0 } }, depthWrite: false, depthTest: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: `uniform float t; varying vec2 vUv;
        void main(){
          vec2 p=(vUv-0.5)*8.0;
          float v=sin(p.x*1.2+t)+sin(p.y*1.4+t*1.1)+sin((p.x+p.y)*0.6+t*0.7)+sin(length(p)*1.1-t*1.3);
          vec3 c=0.5+0.5*cos(vec3(0.0,2.1,4.2)+v*1.8+t*0.3);
          c*=0.12+0.10*abs(sin(v+t));
          gl_FragColor=vec4(c,1.0);
        }`,
    });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(110, 70), mat);
    bg.position.z = -8; bg.renderOrder = -10; this.bgMat = mat; this.scene.add(bg);
  }

  // Clean round glasses: a thick dark frame ring around each eye + a bridge. Emissive surges on FOCUS.
  _addGlasses() {
    const frame = new THREE.MeshStandardMaterial({ color: 0x111118, roughness: 0.4, metalness: 0.6, emissive: 0x114455, emissiveIntensity: 0.4 });
    this.glassesMat = frame;
    const lensR = EYE_R * 1.28, z = EYE_R + 0.18, tube = 0.13;
    for (const side of [-1, 1]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(lensR, tube, 14, 48), frame);
      ring.position.set(side * EYE_X, 0, z); this.scene.add(ring);
    }
    const span = 2 * EYE_X - 2 * lensR + 0.2;
    const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, span, 12), frame);
    bridge.rotation.z = Math.PI / 2; bridge.position.set(0, 0, z); this.scene.add(bridge);
  }

  async _tryLoadModel() {
    try {
      const res = await fetch('models/eye.glb', { method: 'HEAD' });
      if (!res.ok) return;
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      const gltf = await new GLTFLoader().loadAsync('models/eye.glb');
      const fit = (o) => { const b = new THREE.Box3().setFromObject(o); const s = (EYE_R * 2) / b.getSize(new THREE.Vector3()).length(); o.scale.setScalar(s * 1.7); };
      for (const eye of [this.L, this.R]) { const m = gltf.scene.clone(true); fit(m); eye.spinGroup.clear(); eye.spinGroup.add(m); }
    } catch { /* keep procedural eyes */ }
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setPixelRatio(dpr); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.w = w; this.h = h;
  }

  _project(eye) {
    const c = eye.group.getWorldPosition(new THREE.Vector3()).project(this.camera);
    const x = (c.x * 0.5 + 0.5) * this.w, y = (-c.y * 0.5 + 0.5) * this.h;
    const edge = eye.group.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(EYE_R, 0, 0)).project(this.camera);
    const ex = (edge.x * 0.5 + 0.5) * this.w;
    return { x, y, r: Math.abs(ex - x) };
  }

  /** state: { L:{aim,spinDir}, R:{aim,spinDir}, combo, focus } */
  update(state, dt) {
    this._t += dt;
    const hue = (this._t * 30) % 360;
    this.rimL.color.setHSL(((hue + 180) % 360) / 360, 1, 0.5);
    this.rimR.color.setHSL((hue % 360) / 360, 1, 0.55);
    if (this.bgMat) this.bgMat.uniforms.t.value = this._t * 0.8;
    const combo = state.combo || 0;
    const bloodshot = Math.min(1, combo / 30);
    const pupil = 1 + Math.min(0.7, combo / 45) + Math.sin(this._t * 7) * 0.04;
    if (this.glassesMat) this.glassesMat.emissiveIntensity = 0.4 + (state.focus ? 2.4 : 0) + Math.sin(this._t * 4) * 0.08;
    this.L.setHue(196 + Math.sin(this._t * 0.8) * 30);
    this.R.setHue(320 + Math.sin(this._t) * 20);
    for (const k of ['L', 'R']) {
      const eye = this[k], s = state[k] || {};
      eye.spinDir = s.spinDir || 0;
      eye.update(s.aim, dt); eye.setBloodshot(bloodshot); eye.setPupil(pupil);
    }
    this.screen.L = this._project(this.L);
    this.screen.R = this._project(this.R);
  }

  chomp(ring) { (ring === 'L' ? this.L : this.R).chomp(); }
  render() { this.renderer.render(this.scene, this.camera); }
}
