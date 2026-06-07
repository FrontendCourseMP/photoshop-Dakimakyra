import { useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import type { PixelImage } from './types';
import { ALGORITHMS, type ResampleAlgorithm, getAlgorithmInfo, megapixels } from './resample';

type Unit = 'percent' | 'pixels';

interface Props {
  open: boolean;
  image: PixelImage;
  onApply: (width: number, height: number, algorithm: ResampleAlgorithm) => void;
  onCancel: () => void;
}

const MAX_PX = 8192;
const MIN_PX = 1;
const MAX_PCT = 1000;
const MIN_PCT = 1;

export function ResizeDialog({ open, image, onApply, onCancel }: Props) {
  const aspect = image.width / image.height;
  const [unit, setUnit] = useState<Unit>('percent');
  const [widthStr, setWidthStr] = useState('100');
  const [heightStr, setHeightStr] = useState('100');
  const [lock, setLock] = useState(true);
  const [algo, setAlgo] = useState<ResampleAlgorithm>('bilinear');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setUnit('percent');
      setWidthStr('100');
      setHeightStr('100');
      setLock(true);
      setAlgo('bilinear');
      setError(null);
    }
  }, [open, image]);

  const toPx = (val: string, axis: 'w' | 'h'): number => {
    const n = parseFloat(val);
    if (!Number.isFinite(n)) return NaN;
    if (unit === 'percent') {
      const base = axis === 'w' ? image.width : image.height;
      return Math.round((n / 100) * base);
    }
    return Math.round(n);
  };

  const targetW = toPx(widthStr, 'w');
  const targetH = toPx(heightStr, 'h');

  const validate = (w: number, h: number): string | null => {
    if (!Number.isFinite(w) || !Number.isFinite(h)) return 'Введите числовые значения';
    if (w < MIN_PX || h < MIN_PX) return `Минимальный размер ${MIN_PX} пиксель`;
    if (w > MAX_PX || h > MAX_PX) return `Максимум ${MAX_PX} пикселей по стороне`;
    if (unit === 'percent') {
      const wp = parseFloat(widthStr);
      const hp = parseFloat(heightStr);
      if (wp < MIN_PCT || hp < MIN_PCT) return `Минимум ${MIN_PCT}%`;
      if (wp > MAX_PCT || hp > MAX_PCT) return `Максимум ${MAX_PCT}%`;
    }
    return null;
  };

  const validation = useMemo(() => validate(targetW, targetH), [targetW, targetH, unit, widthStr, heightStr]);

  const handleWidth = (v: string) => {
    setWidthStr(v);
    if (!lock) return;
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return;
    if (unit === 'percent') {
      setHeightStr(v);
    } else {
      const h = Math.max(1, Math.round(n / aspect));
      setHeightStr(String(h));
    }
  };

  const handleHeight = (v: string) => {
    setHeightStr(v);
    if (!lock) return;
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return;
    if (unit === 'percent') {
      setWidthStr(v);
    } else {
      const w = Math.max(1, Math.round(n * aspect));
      setWidthStr(String(w));
    }
  };

  const handleUnit = (next: Unit) => {
    if (next === unit) return;
    if (next === 'pixels') {
      setWidthStr(String(toPx(widthStr, 'w')));
      setHeightStr(String(toPx(heightStr, 'h')));
    } else {
      const wp = (Math.round((toPx(widthStr, 'w') / image.width) * 1000) / 10).toString();
      const hp = (Math.round((toPx(heightStr, 'h') / image.height) * 1000) / 10).toString();
      setWidthStr(wp);
      setHeightStr(hp);
    }
    setUnit(next);
  };

  const handleApply = () => {
    const err = validate(targetW, targetH);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    onApply(targetW, targetH, algo);
  };

  const beforeMP = megapixels(image.width, image.height);
  const afterMP = Number.isFinite(targetW) && Number.isFinite(targetH) ? megapixels(targetW, targetH) : 0;
  const algoInfo = getAlgorithmInfo(algo);

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
      <DialogTitle>Изменить размер изображения</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5 }}>
            <Box sx={{ p: 1.25, border: '1px solid #5a2b38', borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                До
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {image.width} × {image.height}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {beforeMP.toFixed(2)} МП
              </Typography>
            </Box>
            <Box sx={{ p: 1.25, border: '1px solid #5a2b38', borderRadius: 1.5 }}>
              <Typography variant="caption" color="text.secondary">
                После
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                {Number.isFinite(targetW) ? targetW : '—'} × {Number.isFinite(targetH) ? targetH : '—'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {afterMP.toFixed(2)} МП
              </Typography>
            </Box>
          </Box>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="body2" sx={{ minWidth: 70 }}>
              Единицы
            </Typography>
            <Select
              size="small"
              value={unit}
              onChange={(e) => handleUnit(e.target.value as Unit)}
              sx={{ flex: 1 }}
            >
              <MenuItem value="percent">Проценты</MenuItem>
              <MenuItem value="pixels">Пиксели</MenuItem>
            </Select>
          </Stack>

          <Stack direction="row" spacing={1.5}>
            <TextField
              label="Ширина"
              size="small"
              type="number"
              value={widthStr}
              onChange={(e) => handleWidth(e.target.value)}
              fullWidth
              InputProps={{ endAdornment: <Typography variant="caption">{unit === 'percent' ? '%' : 'px'}</Typography> }}
            />
            <TextField
              label="Высота"
              size="small"
              type="number"
              value={heightStr}
              onChange={(e) => handleHeight(e.target.value)}
              fullWidth
              InputProps={{ endAdornment: <Typography variant="caption">{unit === 'percent' ? '%' : 'px'}</Typography> }}
            />
          </Stack>

          <FormControlLabel
            control={<Checkbox size="small" checked={lock} onChange={(_, v) => setLock(v)} />}
            label="Сохранять пропорции"
          />

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="body2" sx={{ minWidth: 70 }}>
              Алгоритм
            </Typography>
            <Select
              size="small"
              value={algo}
              onChange={(e) => setAlgo(e.target.value as ResampleAlgorithm)}
              sx={{ flex: 1 }}
            >
              {ALGORITHMS.map((a) => (
                <MenuItem key={a.key} value={a.key}>
                  {a.label}
                </MenuItem>
              ))}
            </Select>
            <Tooltip title={algoInfo.description} placement="top" arrow>
              <HelpOutlineIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            </Tooltip>
          </Stack>

          {(error || validation) && (
            <Typography variant="caption" color="error">
              {error ?? validation}
            </Typography>
          )}
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onCancel}>Отмена</Button>
        <Button
          onClick={handleApply}
          variant="contained"
          disabled={Boolean(validation)}
        >
          Применить
        </Button>
      </DialogActions>
    </Dialog>
  );
}
