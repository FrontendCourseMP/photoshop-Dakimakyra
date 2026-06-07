import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Select,
  Slider,
  Stack,
  Switch,
  TextField,
  Typography,
} from '@mui/material';
import type { PixelImage } from './types';
import {
  type AllLevels,
  type LevelsParams,
  type LevelsTarget,
  TARGETS,
  gammaToMidRel,
  midRelToGamma,
} from './levels';
import { computeHistogram, drawHistogram } from './histogram';

interface Props {
  open: boolean;
  image: PixelImage;
  preview: boolean;
  levels: AllLevels;
  onPreviewChange: (v: boolean) => void;
  onLevelsChange: (l: AllLevels) => void;
  onApply: () => void;
  onCancel: () => void;
  onReset: () => void;
}

const HIST_W = 360;
const HIST_H = 140;

const CHANNEL_COLORS: Record<LevelsTarget, string> = {
  master: '#ffc18f',
  r: '#ff6f61',
  g: '#ffd166',
  b: '#ff3d81',
  a: '#ffc18f',
};

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function clampFloat(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function LevelsDialog({
  open,
  image,
  preview,
  levels,
  onPreviewChange,
  onLevelsChange,
  onApply,
  onCancel,
  onReset,
}: Props) {
  const [target, setTarget] = useState<LevelsTarget>('master');
  const [logScale, setLogScale] = useState(false);
  const [canvasEl, setCanvasEl] = useState<HTMLCanvasElement | null>(null);

  const current = levels[target];

  const hist = useMemo(() => computeHistogram(image, target), [image, target]);

  const canvasRefCb = useCallback((node: HTMLCanvasElement | null) => {
    setCanvasEl(node);
  }, []);

  useEffect(() => {
    if (!canvasEl) return;
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = HIST_W * dpr;
    canvasEl.height = HIST_H * dpr;
    canvasEl.style.width = `${HIST_W}px`;
    canvasEl.style.height = `${HIST_H}px`;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawHistogram(ctx, hist, HIST_W, HIST_H, CHANNEL_COLORS[target], logScale);
  }, [canvasEl, hist, target, logScale]);

  const setParams = (next: LevelsParams) => {
    onLevelsChange({ ...levels, [target]: next });
  };

  const midPos = current.black + gammaToMidRel(current.gamma) * (current.white - current.black);

  const handleSlider = (_: Event, raw: number | number[]) => {
    if (!Array.isArray(raw) || raw.length !== 3) return;
    const [b0, m0, w0] = raw;
    const black = clampInt(b0, 0, 253);
    const white = clampInt(w0, black + 2, 255);
    const safeBlack = Math.min(black, white - 2);
    const mid = clampInt(m0, safeBlack + 1, white - 1);
    const midRel = (mid - safeBlack) / (white - safeBlack);
    const gamma = midRelToGamma(midRel);
    setParams({ black: safeBlack, white, gamma });
  };

  const onBlackInput = (v: string) => {
    const n = clampInt(Number(v) || 0, 0, current.white - 2);
    setParams({ ...current, black: n });
  };

  const onWhiteInput = (v: string) => {
    const n = clampInt(Number(v) || 255, current.black + 2, 255);
    setParams({ ...current, white: n });
  };

  const onGammaInput = (v: string) => {
    const n = clampFloat(Number(v) || 1.0, 0.1, 9.9);
    setParams({ ...current, gamma: Number(n.toFixed(2)) });
  };

  const channelOptions = TARGETS.filter((t) => {
    if (t.key === 'a') return image.meta.hasAlpha;
    if (image.meta.format === 'gb7') return t.key === 'master';
    return true;
  });

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      PaperProps={{
        sx: {
          border: '1px solid #5a2b38',
          borderRadius: 2,
          background: 'linear-gradient(180deg, #26161d 0%, #1f1218 100%)',
        },
      }}
    >
      <DialogTitle sx={{ pb: 0.5 }}>Уровни</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="body2" sx={{ minWidth: 60 }}>
              Канал
            </Typography>
            <Select
              size="small"
              value={target}
              onChange={(e) => setTarget(e.target.value as LevelsTarget)}
              sx={{ flex: 1 }}
            >
              {channelOptions.map((t) => (
                <MenuItem key={t.key} value={t.key}>
                  {t.label}
                </MenuItem>
              ))}
            </Select>
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={logScale}
                  onChange={(_, v) => setLogScale(v)}
                />
              }
              label="Лог"
            />
          </Stack>

          <Box
            sx={{
              border: '1px solid #5a2b38',
              borderRadius: 1.5,
              overflow: 'hidden',
              alignSelf: 'center',
            }}
          >
            <canvas ref={canvasRefCb} />
          </Box>

          <Box sx={{ px: 1 }}>
            <Slider
              value={[current.black, Math.round(midPos), current.white]}
              onChange={handleSlider}
              min={0}
              max={255}
              step={1}
              size="small"
              disableSwap
              sx={{
                '& .MuiSlider-thumb[data-index="1"]': {
                  backgroundColor: '#bdbdbd',
                },
                '& .MuiSlider-thumb[data-index="0"]': {
                  backgroundColor: '#000',
                  border: '2px solid #888',
                },
                '& .MuiSlider-thumb[data-index="2"]': {
                  backgroundColor: '#fff',
                  border: '2px solid #888',
                },
              }}
            />
          </Box>

          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Чёрная точка"
              type="number"
              size="small"
              value={current.black}
              onChange={(e) => onBlackInput(e.target.value)}
              inputProps={{ min: 0, max: 253, step: 1 }}
              fullWidth
            />
            <TextField
              label="Гамма"
              type="number"
              size="small"
              value={current.gamma}
              onChange={(e) => onGammaInput(e.target.value)}
              inputProps={{ min: 0.1, max: 9.9, step: 0.1 }}
              fullWidth
            />
            <TextField
              label="Белая точка"
              type="number"
              size="small"
              value={current.white}
              onChange={(e) => onWhiteInput(e.target.value)}
              inputProps={{ min: 2, max: 255, step: 1 }}
              fullWidth
            />
          </Stack>

          <FormControlLabel
            control={
              <Switch checked={preview} onChange={(_, v) => onPreviewChange(v)} />
            }
            label="Предпросмотр на холсте"
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2, pt: 1 }}>
        <Button onClick={onReset} color="inherit">
          Сброс
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onCancel}>Отмена</Button>
        <Button onClick={onApply} variant="contained">
          Применить
        </Button>
      </DialogActions>
    </Dialog>
  );
}
