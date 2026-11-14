// โหลด three.js จาก CDN (ไม่ก๊อปลง repo) · +esm ของ jsdelivr ชี้ OrbitControls ไปที่ three ตัวเดียวกัน
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm';

const HALF_H = 0.9, HALF_D = 1.0;                             // ตรงกับ HALF_HEIGHT / HALF_DEPTH ใน server.apsi
const radiusOf = total => 0.025 * Math.cbrt(5000 / total);   // ตรงกับ ball_radius() ใน sim.apsi
const FOV = 50;

// ---------- ฉากอวกาศ ----------
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
// กล้องมุมมองแบบมีมิติ: ลูกใกล้ใหญ่ ลูกไกลเล็ก
const camera = new THREE.PerspectiveCamera(FOV, 1, 0.01, 50);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x202638, 1.2));
const sun = new THREE.DirectionalLight(0xffffff, 1.8);
sun.position.set(2, 3, 4);
scene.add(sun);

// ดาวไกล ๆ เป็นฉากหลัง (อยู่นอกอวกาศที่ลูกบอลลอย)
{
  const n = 1500, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(12 + Math.random() * 18);
    p.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x9aa4c0, size: 0.04 })));
}

// วางกล้องให้หน้าอวกาศ (z = +HALF_D) เต็มจอพอดี
function placeCamera() {
  const d = HALF_H / Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  camera.position.set(0, 0, HALF_D + d * 0.95);
  controls.target.set(0, 0, 0);
}
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();
placeCamera();

// ---------- สีแบบผสมสีระบาย: น้ำหนักแดง/เหลือง/น้ำเงิน → สีจอ ----------
// สอดค่าระหว่าง 8 มุมของลูกบาศก์สีระบาย (Gossett & Chen) → เหลือง + น้ำเงิน = เขียว · แดง + เหลือง = ส้ม
const RYB = [
  [1, 1, 1],           // 000 ขาว
  [1, 0, 0],           // 100 แดง
  [1, 1, 0],           // 010 เหลือง
  [1, 0.5, 0],         // 110 ส้ม
  [0.163, 0.373, 0.6], // 001 น้ำเงิน
  [0.5, 0, 0.5],       // 101 ม่วง
  [0, 0.66, 0.2],      // 011 เขียว
  [0.2, 0.094, 0],     // 111 น้ำตาลเข้ม
];
function rybToRgb(r, y, b, out) {
  const m = Math.max(r, y, b) || 1;          // ดันสีให้เข้มเต็มที่ (น้ำหนักรวม = 1 จะอ่อนเกิน)
  r /= m; y /= m; b /= m;
  for (let k = 0; k < 3; k++) {
    const c = i => RYB[i][k];
    const x0 = c(0) * (1 - r) + c(1) * r, x1 = c(2) * (1 - r) + c(3) * r;
    const x2 = c(4) * (1 - r) + c(5) * r, x3 = c(6) * (1 - r) + c(7) * r;
    const y0 = x0 * (1 - y) + x1 * y, y1 = x2 * (1 - y) + x3 * y;
    out[k] = y0 * (1 - b) + y1 * b;
  }
  return out;
}

// ---------- ลูกบอล: InstancedMesh 1 ก้อน วาดทุกลูกในคำสั่งเดียว ----------
let balls = null;
const tmp = new THREE.Object3D();
const rgb = [0, 0, 0];
const color = new THREE.Color();

function makeBalls(total) {
  if (balls) { scene.remove(balls); balls.geometry.dispose(); balls.material.dispose(); }
  const seg = total > 2000 ? 10 : 14;
  balls = new THREE.InstancedMesh(new THREE.SphereGeometry(radiusOf(total), seg, Math.round(seg * 0.7)),
    new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.05 }), total);
  balls.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  // สร้างช่องสีไว้ก่อนวาดครั้งแรก (ไม่งั้น shader คอมไพล์แบบไม่มีสีต่อลูก) · ปิดการตัดทิ้งนอกจอ: ขอบเขตของ InstancedMesh = ลูกเดียวที่จุดกำเนิด
  balls.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3);
  balls.instanceColor.setUsage(THREE.DynamicDrawUsage);
  balls.frustumCulled = false;
  balls.count = 0;
  scene.add(balls);
}

function applyFrame(buf) {
  const head = new Float32Array(buf, 0, 4);
  const n = head[0];
  const pos = new Float32Array(buf, 16, n * 3);
  const col = new Uint8Array(buf, 16 + n * 12, n * 3);
  for (let i = 0; i < n; i++) {
    tmp.position.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
    tmp.updateMatrix();
    balls.setMatrixAt(i, tmp.matrix);
    rybToRgb(col[i * 3], col[i * 3 + 1], col[i * 3 + 2], rgb);
    balls.setColorAt(i, color.setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace));
  }
  balls.count = n;
  balls.instanceMatrix.needsUpdate = true;
  balls.instanceColor.needsUpdate = true;
  return { n, hits: head[1], ms: head[2] };
}

// ---------- คุยกับ apsi ----------
const $ = id => document.getElementById(id);
let total = 2000, native = true, ws = null, waiting = false;
let fpsCount = 0, fpsStart = performance.now(), msAvg = 0;

function send(obj) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); }
function reset() {
  makeBalls(total);
  placeCamera();
  waiting = true;
  msAvg = 0;
  send({ cmd: 'reset', total, native, aspect: window.innerWidth / window.innerHeight });
}

function connect() {
  ws = new WebSocket(`ws://${location.host}/ws`);
  ws.binaryType = 'arraybuffer';
  ws.onopen = () => { $('err').textContent = ''; reset(); };
  ws.onclose = () => { $('err').textContent = 'หลุดจากเซิร์ฟเวอร์ apsi · กำลังต่อใหม่'; setTimeout(connect, 1500); };
  ws.onmessage = ev => {
    const s = applyFrame(ev.data);
    waiting = false;
    fpsCount++;
    // เฟรมเร็ว = เฉลี่ยให้ตัวเลขนิ่ง · เฟรมช้า (โหมดธรรมดา) = โชว์ค่าจริงของเฟรมล่าสุด
    msAvg = (msAvg && s.ms < 100) ? msAvg * 0.9 + s.ms * 0.1 : s.ms;
    $('s-n').textContent = s.n.toLocaleString('th-TH');
    $('s-hits').textContent = Math.round(s.hits).toLocaleString('th-TH');
    $('s-ms').textContent = `${msAvg.toFixed(msAvg < 10 ? 2 : 0)} ms`;
  };
}

// ขอเฟรมถัดไปเมื่อเฟรมก่อนมาถึงแล้ว (ไม่ต่อคิว) · native = จำกัดที่ความเร็วจอ · ธรรมดา = ช้าเท่าที่ apsi คิดทัน
renderer.setAnimationLoop(() => {
  if (!waiting && ws && ws.readyState === 1) { waiting = true; send({ cmd: 'frame' }); }
  const now = performance.now();
  // โหมดธรรมดาได้ไม่ถึง 1 เฟรม/วินาที → นับรวมช่วงยาวขึ้นจนกว่าจะมีเฟรมมาถึง
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
  $('mode').classList.toggle('on', native);
  $('mode').textContent = native ? '⚡ native ทุกคอร์' : '🐢 โหมดธรรมดา';
  msAvg = 0;
  send({ cmd: 'mode', native });
});
$('reset').addEventListener('click', reset);
// เต็มจอ: ขยายแล้วโปรยใหม่ให้อวกาศพอดีสัดส่วนจอใหม่
$('full').addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen();
});
document.addEventListener('fullscreenchange', () => setTimeout(reset, 150));

connect();
