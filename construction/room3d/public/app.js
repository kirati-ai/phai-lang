// โหลด three.js จาก CDN (ไม่ก๊อปลง repo) · +esm ของ jsdelivr ชี้ OrbitControls ไปที่ three ตัวเดียวกัน
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/+esm';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js/+esm';

const FIELDS = ['width','length','height','door_w','door_h','win_w','win_h'];
const SILL = 0.9;              // หน้าต่างสูงจากพื้น 0.90 ม. (ตรงกับด่านใน server.apsi)
const fmt = n => n.toLocaleString('th-TH', { minimumFractionDigits:2, maximumFractionDigits:2 });

// ---------- ฉาก ----------
const view = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ antialias:true });
renderer.setPixelRatio(window.devicePixelRatio);
view.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xeef1f5);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
camera.position.set(6, 5, 7);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8f99, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(5, 8, 4);
scene.add(sun);

function resize() {
  const w = view.clientWidth, h = view.clientHeight || 400;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ลายกระเบื้อง 60×60 ซม.: 1 รูปต่อ 1 แผ่น แล้วซ้ำตามขนาดห้อง
function tileTexture(w, l) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#d9cfc0'; g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#a89c8a'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(w / 0.6, l / 0.6);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ผนัง 1 ด้าน (ระนาบ XY) พร้อมช่องเปิด
function wall(len, h, hole) {
  const s = new THREE.Shape();
  s.moveTo(-len/2, 0); s.lineTo(len/2, 0); s.lineTo(len/2, h); s.lineTo(-len/2, h); s.closePath();
  if (hole) {
    const p = new THREE.Path();
    p.moveTo(hole.x - hole.w/2, hole.y); p.lineTo(hole.x + hole.w/2, hole.y);
    p.lineTo(hole.x + hole.w/2, hole.y + hole.h); p.lineTo(hole.x - hole.w/2, hole.y + hole.h); p.closePath();
    s.holes.push(p);
  }
  return new THREE.Mesh(new THREE.ShapeGeometry(s),
    new THREE.MeshStandardMaterial({ color:0xf3efe6, side:THREE.DoubleSide, roughness:0.9 }));
}

let room = new THREE.Group();
scene.add(room);

function build(d) {
  scene.remove(room);
  room.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
  room = new THREE.Group();
  const { width:W, length:L, height:H } = d;

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, L),
    new THREE.MeshStandardMaterial({ map:tileTexture(W, L), roughness:0.6 }));
  floor.rotation.x = -Math.PI / 2;
  room.add(floor);

  const slab = new THREE.Mesh(new THREE.BoxGeometry(W, 0.1, L),
    new THREE.MeshStandardMaterial({ color:0x9a9a9a, roughness:1 }));
  slab.position.y = -0.051;
  room.add(slab);

  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(W, L),
    new THREE.MeshStandardMaterial({ color:0xffffff, transparent:true, opacity:0.25, side:THREE.DoubleSide }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = H;
  room.add(ceiling);

  const front = wall(W, H, { x:0, y:0, w:d.door_w, h:d.door_h });   // ผนังหน้า: ประตู
  front.position.z = L / 2;
  const back = wall(W, H);
  back.position.z = -L / 2;
  const right = wall(L, H, d.win_w > 0 && d.win_h > 0 ? { x:0, y:SILL, w:d.win_w, h:d.win_h } : null);
  right.rotation.y = Math.PI / 2; right.position.x = W / 2;        // ผนังขวา: หน้าต่าง
  const left = wall(L, H);
  left.rotation.y = Math.PI / 2; left.position.x = -W / 2;
  room.add(front, back, right, left);

  // ขอบผนังให้เห็นทรงชัด
  room.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, H, L)),
    new THREE.LineBasicMaterial({ color:0x7a8394 })).translateY(H / 2));

  scene.add(room);
  controls.target.set(0, H / 2, 0);
}

// ---------- คำนวณที่ apsi ----------
let timer;
async function update() {
  const d = {};
  for (const f of FIELDS) d[f] = parseFloat(document.getElementById(f).value);
  const err = document.getElementById('err');
  if (FIELDS.some(f => Number.isNaN(d[f]))) { err.textContent = 'กรอกตัวเลขให้ครบ'; return; }
  try {
    const res = await fetch('/api/room', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(d) });
    const body = await res.json();
    if (!res.ok) { err.textContent = body.error ?? body.message ?? 'คำนวณไม่สำเร็จ'; return; }
    err.textContent = '';
    build(d);
    document.getElementById('items').innerHTML = body.items.map((it, i) =>
      `<tr><td>${i + 1}. ${it.name}</td><td class="n">${it.qty} ${it.unit}</td><td class="n">${fmt(it.baht)}</td></tr>`).join('');
    document.getElementById('total').textContent = fmt(body.total_baht);
    document.getElementById('area').innerHTML =
      `พื้น ${fmt(body.floor_m2)} ตร.ม. · ผนังสุทธิ ${fmt(body.wall_m2)} ตร.ม. · คอนกรีต ${body.slab_m3.toFixed(3)} ลบ.ม.`;
  } catch (e) {
    err.textContent = 'ติดต่อเซิร์ฟเวอร์ apsi ไม่ได้';
  }
}
for (const f of FIELDS) document.getElementById(f).addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(update, 250); });

resize();
update();
renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
