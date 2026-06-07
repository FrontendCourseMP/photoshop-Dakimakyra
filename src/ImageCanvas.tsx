import { useEffect, useRef, useState } from 'react';
import { Box, Typography } from '@mui/material';
import type { PixelImage, PixelSample, ToolMode } from './types';
import { applyChannelMask, type ChannelMask } from './channels';

interface Props {
  image: PixelImage | null;
  mask: ChannelMask;
  tool: ToolMode;
  onPick: (sample: PixelSample) => void;
  zoom: number;
  onContainerSize?: (size: { width: number; height: number }) => void;
}

export function ImageCanvas({ image, mask, tool, onPick, zoom, onContainerSize }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });
  const [displayRect, setDisplayRect] = useState({ x: 0, y: 0, w: 0, h: 0 });

  useEffect(() => {
    if (!image) {
      sourceRef.current = null;
      return;
    }
    const src = document.createElement('canvas');
    src.width = image.width;
    src.height = image.height;
    const sctx = src.getContext('2d');
    if (sctx) {
      sctx.putImageData(applyChannelMask(image, mask), 0, 0);
    }
    sourceRef.current = src;
  }, [image, mask]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const update = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      setContainerSize({ w, h });
      onContainerSize?.({ width: w, height: h });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(container);
    return () => ro.disconnect();
  }, [onContainerSize]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const src = sourceRef.current;
    if (!canvas) return;

    const { w: cw, h: ch } = containerSize;
    if (!image || !src || cw === 0 || ch === 0) {
      canvas.width = 0;
      canvas.height = 0;
      setDisplayRect({ x: 0, y: 0, w: 0, h: 0 });
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    canvas.style.width = `${cw}px`;
    canvas.style.height = `${ch}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#1f1117';
    ctx.fillRect(0, 0, cw, ch);

    const dispW = Math.max(1, image.width * zoom);
    const dispH = Math.max(1, image.height * zoom);
    const dx = (cw - dispW) / 2;
    const dy = (ch - dispH) / 2;
    setDisplayRect({ x: dx, y: dy, w: dispW, h: dispH });

    drawCheckerboard(ctx, dx, dy, dispW, dispH);
    ctx.imageSmoothingEnabled = zoom < 1;
    ctx.drawImage(src, dx, dy, dispW, dispH);
  }, [image, mask, zoom, containerSize]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!image || tool !== 'eyedropper') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cssX = e.clientX - rect.left;
    const cssY = e.clientY - rect.top;
    const { x, y, w, h } = displayRect;
    if (w === 0 || h === 0) return;
    const ix = Math.floor(((cssX - x) / w) * image.width);
    const iy = Math.floor(((cssY - y) / h) * image.height);
    if (ix < 0 || iy < 0 || ix >= image.width || iy >= image.height) return;
    const o = (iy * image.width + ix) * 4;
    onPick({
      x: ix,
      y: iy,
      r: image.data[o],
      g: image.data[o + 1],
      b: image.data[o + 2],
      a: image.data[o + 3],
    });
  };

  const cursor = image && tool === 'eyedropper' ? 'crosshair' : 'default';

  return (
    <Box
      ref={containerRef}
      sx={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        p: 2,
        bgcolor: '#170d12',
      }}
    >
      {image ? (
        <canvas
          ref={canvasRef}
          onClick={handleClick}
          style={{
            cursor,
            borderRadius: '6px',
            boxShadow: '0 0 0 1px #5c2f3d, 0 10px 30px rgba(0,0,0,0.55)',
          }}
        />
      ) : (
        <Typography color="text.secondary" sx={{ userSelect: 'none' }}>
          Загрузите изображение (PNG, JPG или GB7), чтобы начать
        </Typography>
      )}
    </Box>
  );
}

function drawCheckerboard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const tile = 10;
  for (let ty = 0; ty < h; ty += tile) {
    for (let tx = 0; tx < w; tx += tile) {
      const even = ((tx / tile) | 0) % 2 === ((ty / tile) | 0) % 2;
      ctx.fillStyle = even ? '#4a2933' : '#341c24';
      const dw = Math.min(tile, w - tx);
      const dh = Math.min(tile, h - ty);
      ctx.fillRect(x + tx, y + ty, dw, dh);
    }
  }
}
