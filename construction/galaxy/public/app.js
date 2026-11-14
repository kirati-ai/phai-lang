// โหลด three.js จาก CDN (ไม่ก๊อปลง repo) · +esm ของ jsdelivr ชี้ OrbitControls ไปที่ three ตัวเดียวกัน
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm';

const SLOW_LIMIT = 2000;          // ตรงกับ SLOW_LIMIT ใน server.apsi

// ---------- ฉาก ----------
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
camera.position.set(0, -26, 30);         // มองเฉียงจากด้านล่าง เห็นทั้งจานที่เอียงและจานที่แบน
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// จุดดาวกลมนุ่ม (วาดด้วย canvas ไม่ต้องโหลดรูป)
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const DOT = dotTexture();

// ---------- ดาว: Points ก้อนเดียว · ใกล้ใหญ่ไกลเล็ก · แสงบวกกัน (ตรงที่ดาวแน่นจะสว่างขึ้นเอง) ----------
let stars = null, cores = null;
function makeStars(buf) {
  for (const o of [stars, cores]) if (o) { scene.remove(o); o.geometry.dispose(); o.material.dispose(); }
  const n = new Float32Array(buf, 0, 6)[0];
  const pos = new Float32Array(buf, 24, n * 3);
  const half = Math.floor(n / 2);
  const coreA = half - 1, coreB = n - 1;
  // สีตามกาแล็กซีและระยะจากแกนตอนเริ่ม: ใกล้แกน = ขาวอมเหลือง · ขอบ A = ฟ้า · ขอบ B = ส้มชมพู
  const colors = new Float32Array(n * 3);
  const inner = new THREE.Color(0xfff2d0), edgeA = new THREE.Color(0x6f9dff), edgeB = new THREE.Color(0xff8a5c);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    const k = i < half ? coreA : coreB;
    const d = Math.hypot(pos[i * 3] - pos[k * 3], pos[i * 3 + 1] - pos[k * 3 + 1], pos[i * 3 + 2] - pos[k * 3 + 2]);
    c.copy(inner).lerp(i < half ? edgeA : edgeB, Math.min(d / 5, 1));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const size = n > 10000 ? 0.22 : n > 4000 ? 0.3 : 0.42;
  stars = new THREE.Points(g, new THREE.PointsMaterial({
    size, map: DOT, vertexColors: true, transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, opacity: n > 10000 ? 0.55 : 0.8,
  }));
  stars.frustumCulled = false;
  scene.add(stars);
  // แกนกลางสองวง: จุดใหญ่สว่าง
  const cg = new THREE.BufferGeometry();
  cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
  cores = new THREE.Points(cg, new THREE.PointsMaterial({ size: 2.2, map: DOT, color: 0xfff6e0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  cores.frustumCulled = false;
  cores.userData = { coreA, coreB };
  scene.add(cores);
}

function applyFrame(buf) {
  const head = new Float32Array(buf, 0, 6);
  const n = head[0];
  const pos = new Float32Array(buf, 24, n * 3);
  stars.geometry.attributes.position.array.set(pos);
  stars.geometry.attributes.position.needsUpdate = true;
  const { coreA, coreB } = cores.userData;
  const cp = cores.geometry.attributes.position.array;
  cp.set(pos.subarray(coreA * 3, coreA * 3 + 3), 0);
  cp.set(pos.subarray(coreB * 3, coreB * 3 + 3), 3);
  cores.geometry.attributes.position.needsUpdate = true;
  return { n, ms: head[1], myr: head[2], drift: head[3], native: head[4] === 1, mpairs: head[5] };
}

// ---------- คุยกับ apsi ----------
const $ = id => document.getElementById(id);
const th = (x, d = 0) => x.toLocaleString('th-TH', { minimumFractionDigits: d, maximumFractionDigits: d });
let total = 5000, native = true, ws = null, waiting = false, fresh = false;
let fpsCount = 0, fpsStart = performance.now(), msAvg = 0;

function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function syncModeButton() {
  const locked = total > SLOW_LIMIT;
  if (locked) native = true;
  $('mode').disabled = locked;
  $('mode').classList.toggle('on', native);
  $('mode').textContent = native ? '⚡ native ทุกคอร์' : '🐢 โหมดธรรมดา';
}
function reset() {
  syncModeButton();
  waiting = true; fresh = true; msAvg = 0;
  send({ cmd: 'reset', total, native });
}

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { $('err').textContent = ''; reset(); };
  ws.onclose = () => { $('err').textContent = 'หลุดจากเซิร์ฟเวอร์ apsi · กำลังต่อใหม่'; setTimeout(connect, 1500); };
  ws.onmessage = ev => {
    if (fresh) { makeStars(ev.data); fresh = false; }
    const s = applyFrame(ev.data);
    waiting = false;
    fpsCount++;
    if (s.ms > 0) msAvg = (msAvg && s.ms < 100) ? msAvg * 0.9 + s.ms * 0.1 : s.ms;
    $('s-n').textContent = th(s.n);
    $('s-pairs').textContent = `${th(s.mpairs)} ล้านคู่`;
    $('s-ms').textContent = msAvg ? `${th(msAvg, msAvg < 10 ? 2 : 0)} ms` : '–';
    $('s-t').textContent = `${th(s.myr, 1)} ล้านปี`;
    $('s-e').textContent = s.myr > 1 ? `${s.drift.toFixed(s.drift < 0.01 ? 4 : 3)}%` : '–';
  };
}

renderer.setAnimationLoop(() => {
  if (!waiting && ws && ws.readyState === 1) { waiting = true; send({ cmd: 'frame' }); }
  const now = performance.now();
  if (now - fpsStart > 1000 && (fpsCount > 0 || now - fpsStart > 10000)) {
    const fps = fpsCount * 1000 / (now - fpsStart);
    $('s-fps').textContent = fps.toFixed(fps < 1 ? 2 : fps < 10 ? 1 : 0);
    fpsCount = 0; fpsStart = now;
  }
  controls.update();
  renderer.render(scene, camera);
});

for (const b of document.querySelectorAll('#sizes button')) {
  b.addEventListener('click', () => {
    total = Number(b.dataset.total);
    for (const o of document.querySelectorAll('#sizes button')) o.classList.toggle('on', o === b);
    reset();
  });
}
$('mode').addEventListener('click', () => {
  native = !native;
  syncModeButton();
  msAvg = 0;
  send({ cmd: 'mode', native });
});
$('reset').addEventListener('click', reset);
$('full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
});

connect();
