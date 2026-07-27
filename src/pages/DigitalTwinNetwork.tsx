import { useEffect, useRef } from "react";
import * as THREE from "three";

/**
 * Fundo animado "Digital Twin": rede de partículas conectadas por linhas,
 * com "pacotes de dados" trafegando entre os nós e leve parallax do mouse.
 *
 * Uso: <DigitalTwinNetwork className="absolute inset-0 z-0" />
 * Requer o pacote "three" instalado (npm install three @types/three).
 */
export default function DigitalTwinNetwork({ className = "" }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let width = window.innerWidth;
    let height = window.innerHeight;

    // ── Scene / Camera / Renderer ──────────────────────────────────────────
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(0, 30, 40);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Cores alinhadas à identidade visual do Atlas Control
    const colorBlue = new THREE.Color("#3B82F6");
    const colorPurple = new THREE.Color("#8B5CF6");
    const colorLight = new THREE.Color("#94A3B8");

    // ── Nós (infraestrutura) ────────────────────────────────────────────────
    const nodeCount = 400;
    const gridSize = 60;
    const positions: number[] = [];
    const colors: number[] = [];
    const sizes: number[] = [];
    const nodes: { x: number; y: number; z: number; id: number; connections: number[] }[] = [];

    for (let i = 0; i < nodeCount; i++) {
      const x = (Math.random() - 0.5) * gridSize;
      const z = (Math.random() - 0.5) * gridSize;
      const y = Math.random() < 0.2 ? Math.random() * 10 : Math.random() * 0.5;

      positions.push(x, y, z);

      let c = y > 2 ? colorBlue : colorLight;
      if (Math.random() < 0.1) c = colorPurple;
      colors.push(c.r, c.g, c.b);
      sizes.push(Math.random() * 1.5 + 0.5);

      nodes.push({ x, y, z, id: i, connections: [] });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

    const pointMaterial = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float time;
        void main() {
          vColor = color;
          float pulse = sin(position.x * 1.0 + time * 0.5) * 0.15 + 1.0;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * pulse * (100.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying vec3 vColor;
        void main() {
          float d = distance(gl_PointCoord, vec2(0.5));
          if (d > 0.5) discard;
          float alpha = smoothstep(0.5, 0.1, d);
          gl_FragColor = vec4(vColor, alpha * 0.8);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    const particles = new THREE.Points(geometry, pointMaterial);
    scene.add(particles);

    // ── Linhas de conexão ────────────────────────────────────────────────────
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x94a3b8,
      transparent: true,
      opacity: 0.15,
    });

    const linePositions: number[] = [];
    const connectionDistance = 6.0;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dz = nodes[i].z - nodes[j].z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist < connectionDistance) {
          linePositions.push(nodes[i].x, nodes[i].y, nodes[i].z, nodes[j].x, nodes[j].y, nodes[j].z);
          nodes[i].connections.push(j);
          nodes[j].connections.push(i);
        }
      }
    }

    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(linePositions, 3));
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    scene.add(lines);

    // ── Pacotes de dados (luzes viajando pelas conexões) ────────────────────
    const packetCount = 40;
    const packetGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const packetMat = new THREE.MeshBasicMaterial({ color: 0x3b82f6 });
    const packets: {
      mesh: THREE.Mesh;
      currentNode: number;
      targetNode: number;
      progress: number;
      speed: number;
    }[] = [];

    for (let i = 0; i < packetCount; i++) {
      const mesh = new THREE.Mesh(packetGeo, packetMat);
      scene.add(mesh);
      packets.push({
        mesh,
        currentNode: Math.floor(Math.random() * nodes.length),
        targetNode: -1,
        progress: 0,
        speed: Math.random() * 0.02 + 0.01,
      });
    }

    // ── Parallax do mouse ────────────────────────────────────────────────────
    let targetCameraX = 0;
    let targetCameraY = 30;

    const handleMouseMove = (event: MouseEvent) => {
      targetCameraX = (event.clientX - width / 2) * 0.003;
      targetCameraY = 30 + (event.clientY - height / 2) * 0.003;
    };

    const handleResize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
    };

    document.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("resize", handleResize);

    // ── Loop de animação ─────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let frameId: number;

    const animate = () => {
      frameId = requestAnimationFrame(animate);

      pointMaterial.uniforms.time.value = clock.getElapsedTime();

      camera.position.x += (targetCameraX - camera.position.x) * 0.03;
      camera.position.y += (targetCameraY - camera.position.y) * 0.03;
      camera.lookAt(0, 0, 0);

      packets.forEach((p) => {
        const start = nodes[p.currentNode];

        if (p.targetNode === -1) {
          if (start.connections.length > 0) {
            p.targetNode = start.connections[Math.floor(Math.random() * start.connections.length)];
          } else {
            p.currentNode = Math.floor(Math.random() * nodes.length);
            return;
          }
        }

        const target = nodes[p.targetNode];
        p.progress += p.speed;

        if (p.progress >= 1.0) {
          p.currentNode = p.targetNode;
          p.targetNode = -1;
          p.progress = 0;
        } else {
          p.mesh.position.x = start.x + (target.x - start.x) * p.progress;
          p.mesh.position.y = start.y + (target.y - start.y) * p.progress;
          p.mesh.position.z = start.z + (target.z - start.z) * p.progress;
          p.mesh.position.y += Math.sin(p.progress * Math.PI) * 0.5;
        }
      });

      renderer.render(scene, camera);
    };

    animate();

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(frameId);
      document.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("resize", handleResize);

      geometry.dispose();
      pointMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      packetGeo.dispose();
      packetMat.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ pointerEvents: "auto" }}
      aria-hidden="true"
    />
  );
}