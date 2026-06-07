import {
  Box,
  Divider,
  IconButton,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import { useState, useEffect } from 'react';
import type { PixelImage } from './types';

interface Props {
  image: PixelImage | null;
  fileName: string | null;
  zoom: number;
  onZoomChange: (z: number) => void;
  onFit: () => void;
  zoomMin: number;
  zoomMax: number;
}

const PRESETS = [0.12, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3];

function pct(z: number): number {
  return Math.round(z * 100);
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', gap: 0.75, alignItems: 'baseline' }}>
      <Typography variant="caption" color="text.secondary">
        {label}:
      </Typography>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}

export function StatusBar({ image, fileName, zoom, onZoomChange, onFit, zoomMin, zoomMax }: Props) {
  const [text, setText] = useState(String(pct(zoom)));

  useEffect(() => {
    setText(String(pct(zoom)));
  }, [zoom]);

  const presetValue = PRESETS.includes(Number(zoom.toFixed(2))) ? Number(zoom.toFixed(2)) : '';

  const commitText = (raw: string) => {
    const n = parseInt(raw.replace('%', '').trim(), 10);
    if (!Number.isFinite(n)) {
      setText(String(pct(zoom)));
      return;
    }
    const clamped = Math.max(pct(zoomMin), Math.min(pct(zoomMax), n));
    onZoomChange(clamped / 100);
    setText(String(clamped));
  };

  return (
    <Box
      component="footer"
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        px: 2,
        height: 32,
        flexShrink: 0,
        bgcolor: '#331a22',
        color: '#fff',
        borderTop: '1px solid #5a2b38',
        overflowX: 'auto',
        whiteSpace: 'nowrap',
      }}
    >
      {image ? (
        <>
          {fileName && <Item label="Файл" value={fileName} />}
          <Divider orientation="vertical" flexItem sx={{ borderColor: 'rgba(255,233,214,0.25)' }} />
          <Item label="Ширина" value={`${image.width} px`} />
          <Item label="Высота" value={`${image.height} px`} />
          <Item label="Глубина цвета" value={image.meta.colorDepthLabel} />
          <Item label="Формат" value={image.meta.format.toUpperCase()} />
          <Box sx={{ flex: 1 }} />
          <Tooltip title="Вписать изображение в окно">
            <span>
              <IconButton
                size="small"
                onClick={onFit}
                sx={{ color: '#ffd9bf' }}
              >
                <FitScreenIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          <Typography variant="caption" sx={{ opacity: 0.85 }}>
            Масштаб
          </Typography>
          <Select
            size="small"
            value={presetValue}
            displayEmpty
            onChange={(e) => {
              const v = Number(e.target.value);
              if (!Number.isNaN(v) && v > 0) onZoomChange(v);
            }}
            sx={{
              minWidth: 92,
              color: '#ffe5d1',
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,229,209,0.35)' },
              '& .MuiSvgIcon-root': { color: '#ffe5d1' },
              '& .MuiSelect-select': { py: '2px' },
            }}
          >
            <MenuItem value="" disabled>
              Пресеты
            </MenuItem>
            {PRESETS.map((p) => (
              <MenuItem key={p} value={p}>
                {pct(p)}%
              </MenuItem>
            ))}
          </Select>
          <TextField
            size="small"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => commitText(text)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitText(text);
                (e.target as HTMLElement).blur();
              }
            }}
            sx={{
              width: 70,
              '& .MuiInputBase-input': { color: '#ffe5d1', py: '2px' },
              '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,229,209,0.35)' },
            }}
            InputProps={{
              endAdornment: <Typography variant="caption" sx={{ ml: 0.5 }}>%</Typography>,
            }}
          />
        </>
      ) : (
        <Typography variant="caption">Изображение не загружено</Typography>
      )}
    </Box>
  );
}
