import { useEffect, useMemo, useRef } from 'react';
import { Box, Divider, Typography } from '@mui/material';
import type { PixelImage, PixelSample } from './types';
import {
  type ChannelInfo,
  type ChannelKey,
  type ChannelMask,
  buildChannelThumbnail,
  listChannels,
} from './channels';
import { formatLab, rgbToLab } from './color';

const THUMB_MAX = 140;

interface ChannelThumbProps {
  image: PixelImage;
  info: ChannelInfo;
  active: boolean;
  onToggle: () => void;
}

function ChannelThumb({ image, info, active, onToggle }: ChannelThumbProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  const dims = useMemo(() => {
    const scale = Math.min(THUMB_MAX / image.width, THUMB_MAX / image.height, 1);
    return {
      w: Math.max(1, Math.round(image.width * scale)),
      h: Math.max(1, Math.round(image.height * scale)),
    };
  }, [image.width, image.height]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const src = document.createElement('canvas');
    src.width = image.width;
    src.height = image.height;
    const sctx = src.getContext('2d');
    if (!sctx) return;
    sctx.putImageData(buildChannelThumbnail(image, info.key), 0, 0);

    canvas.width = dims.w;
    canvas.height = dims.h;
    ctx.imageSmoothingEnabled = true;
    ctx.clearRect(0, 0, dims.w, dims.h);
    ctx.drawImage(src, 0, 0, image.width, image.height, 0, 0, dims.w, dims.h);
  }, [image, info.key, dims.w, dims.h]);

  return (
    <Box
      onClick={onToggle}
      sx={{
        cursor: 'pointer',
        p: 0.75,
        borderRadius: 1.5,
        border: '1px solid',
        borderColor: active ? 'primary.main' : '#5c2f3d',
        bgcolor: active ? 'rgba(255,122,24,0.16)' : '#2a171e',
        opacity: active ? 1 : 0.45,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0.5,
        transition: 'all 0.15s',
      }}
    >
      <canvas
        ref={ref}
        style={{
          maxWidth: '100%',
          background:
            'repeating-conic-gradient(#4f2633 0 25%, #3a1d28 0 50%) 0 0/12px 12px',
          borderRadius: '6px',
        }}
      />
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {info.label}
      </Typography>
    </Box>
  );
}

interface ChannelsPanelProps {
  image: PixelImage;
  mask: ChannelMask;
  onMaskChange: (mask: ChannelMask) => void;
}

function ChannelsPanel({ image, mask, onMaskChange }: ChannelsPanelProps) {
  const channels = listChannels(image);

  const isActive = (key: ChannelKey) => mask[key];
  const toggle = (key: ChannelKey) => {
    onMaskChange({ ...mask, [key]: !mask[key] });
  };

  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="overline" color="text.secondary">
        Каналы
      </Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        {channels.map((c) => (
          <ChannelThumb
            key={c.key}
            image={image}
            info={c}
            active={isActive(c.key)}
            onToggle={() => toggle(c.key)}
          />
        ))}
      </Box>
      <Typography variant="caption" color="text.secondary">
        Нажмите на миниатюру, чтобы включить или выключить канал. Если оставить только альфу,
        изображение покажется как маска прозрачности.
      </Typography>
    </Box>
  );
}

interface EyedropperPanelProps {
  sample: PixelSample | null;
  active: boolean;
}

function ColorSwatch({ r, g, b, a }: { r: number; g: number; b: number; a: number }) {
  return (
    <Box
      sx={{
        width: 40,
        height: 40,
        borderRadius: 1,
        border: '1px solid #555',
        background:
          'repeating-conic-gradient(#4f2633 0 25%, #3a1d28 0 50%) 0 0/8px 8px',
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          backgroundColor: `rgba(${r}, ${g}, ${b}, ${a / 255})`,
        }}
      />
    </Box>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
      <Typography
        variant="caption"
        sx={{ fontFamily: 'monospace', fontWeight: 600, textAlign: 'right' }}
      >
        {value}
      </Typography>
    </Box>
  );
}

function EyedropperPanel({ sample, active }: EyedropperPanelProps) {
  return (
    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
      <Typography variant="overline" color="text.secondary">
        Пипетка цвета
      </Typography>
      {!sample ? (
        <Typography variant="caption" color="text.secondary">
          {active
            ? 'Кликните по изображению, чтобы получить цвет пикселя.'
            : 'Активируйте инструмент "Пипетка" в тулбаре и кликните по изображению.'}
        </Typography>
      ) : (
        <>
          <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
            <ColorSwatch r={sample.r} g={sample.g} b={sample.b} a={sample.a} />
            <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
              <Row label="X, Y" value={`${sample.x}, ${sample.y}`} />
              <Row label="RGB" value={`${sample.r}, ${sample.g}, ${sample.b}`} />
              {sample.a !== 255 && <Row label="Alpha" value={`${sample.a}`} />}
            </Box>
          </Box>
          <Divider sx={{ my: 0.5 }} />
          <Row label="HEX" value={toHex(sample.r, sample.g, sample.b)} />
          <Row label="CIELAB" value={formatLab(rgbToLab(sample.r, sample.g, sample.b))} />
        </>
      )}
    </Box>
  );
}

function toHex(r: number, g: number, b: number): string {
  const h = (v: number) => v.toString(16).padStart(2, '0').toUpperCase();
  return `#${h(r)}${h(g)}${h(b)}`;
}

interface SidePanelProps {
  image: PixelImage | null;
  mask: ChannelMask;
  onMaskChange: (mask: ChannelMask) => void;
  sample: PixelSample | null;
  toolActive: boolean;
}

export function SidePanel({
  image,
  mask,
  onMaskChange,
  sample,
  toolActive,
}: SidePanelProps) {
  return (
    <Box
      sx={{
        width: 300,
        flexShrink: 0,
        bgcolor: '#24151b',
        borderLeft: '1px solid #5a2b38',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {image ? (
        <>
          <ChannelsPanel image={image} mask={mask} onMaskChange={onMaskChange} />
          <Divider />
          <EyedropperPanel sample={sample} active={toolActive} />
        </>
      ) : (
        <Box sx={{ p: 2 }}>
          <Typography variant="caption" color="text.secondary">
            Загрузите изображение, чтобы увидеть каналы и работать с пипеткой.
          </Typography>
        </Box>
      )}
    </Box>
  );
}

