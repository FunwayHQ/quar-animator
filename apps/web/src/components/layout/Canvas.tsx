import { useRef, useEffect, useState, useCallback } from 'react';
import styles from './Canvas.module.css';

export function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [zoom, setZoom] = useState(100);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Handle canvas resize
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;

        // Render placeholder grid
        renderGrid(canvas, dpr);
      }
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, []);

  // Render a simple grid
  const renderGrid = useCallback((canvas: HTMLCanvasElement, dpr: number) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const gridSize = 20 * dpr;

    ctx.fillStyle = '#1A1A1A';
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = '#262626';
    ctx.lineWidth = 1;

    // Draw grid
    for (let x = 0; x <= width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    for (let y = 0; y <= height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw center crosshair
    const centerX = width / 2;
    const centerY = height / 2;

    ctx.strokeStyle = '#404040';
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(centerX - 20 * dpr, centerY);
    ctx.lineTo(centerX + 20 * dpr, centerY);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(centerX, centerY - 20 * dpr);
    ctx.lineTo(centerX, centerY + 20 * dpr);
    ctx.stroke();

    // Draw "Canvas Ready" text
    ctx.fillStyle = '#525252';
    ctx.font = `${14 * dpr}px Inter, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('Canvas Ready - WebGL renderer will be initialized here', centerX, centerY + 50 * dpr);
  }, []);

  // Handle mouse move for coordinates
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Convert to world coordinates (placeholder - just screen coords for now)
    setMousePos({ x: Math.round(x), y: Math.round(y) });
  }, []);

  // Handle wheel for zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -10 : 10;
      setZoom((prev) => Math.max(10, Math.min(1000, prev + delta)));
    }
  }, []);

  return (
    <div className={styles.canvasContainer} ref={containerRef}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
      />
      <div className={styles.statusBar}>
        <span className={styles.coordinates}>
          X: {mousePos.x} Y: {mousePos.y}
        </span>
        <span className={styles.zoom}>{zoom}%</span>
      </div>
    </div>
  );
}

export default Canvas;
