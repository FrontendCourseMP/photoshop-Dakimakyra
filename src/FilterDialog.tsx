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
  FormGroup,
  MenuItem,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import type { PixelImage } from './types';
import {
  KERNEL_SIZE,
  PADDING_LABELS,
  PRESETS,
  getPreset,
  type ChannelMaskRGBA,
  type FilterMode,
  type PaddingMode,
} from './convolution';

interface Props {
  open: boolean;
  image: PixelImage;
  preview: boolean;
  busy: boolean;
  presetKey: string;
  mode: FilterMode;
  kernel: string[];
  padding: PaddingMode;
  channels: ChannelMaskRGBA;
  onPreviewChange: (v: boolean) => void;
  onPresetChange: (key: string) => void;
  onModeChange: (mode: FilterMode) => void;
  onKernelChange: (next: string[]) => void;
  onPaddingChange: (p: PaddingMode) => void;
  onChannelsChange: (c: ChannelMaskRGBA) => void;
  onApply: () => void;
  onCancel: () => void;
  onReset: () => void;
}

const NUM_RE = /^-?\d*\.?\d*$/;

export function FilterDialog({
  open,
  image,
  preview,
  busy,
  presetKey,
  mode,
  kernel,
  padding,
  channels,
  onPreviewChange,
  onPresetChange,
  onModeChange,
  onKernelChange,
  onPaddingChange,
  onChannelsChange,
  onApply,
  onCancel,
  onReset,
}: Props) {
  const isGray = image.meta.format === 'gb7';
  const presetInfo = useMemo(() => getPreset(presetKey), [presetKey]);
  const [localKernel, setLocalKernel] = useState<string[]>(kernel);

  useEffect(() => {
    setLocalKernel(kernel);
  }, [kernel]);

  const updateCell = (idx: number, value: string) => {
    if (!NUM_RE.test(value)) return;
    const next = localKernel.slice();
    next[idx] = value;
    setLocalKernel(next);
    onKernelChange(next);
  };

  const setChannel = (k: keyof ChannelMaskRGBA, v: boolean) => {
    onChannelsChange({ ...channels, [k]: v });
  };

  const channelControls = isGray ? (
    <FormGroup row>
      <FormControlLabel
        control={
          <Checkbox
            size="small"
            checked={channels.r && channels.g && channels.b}
            onChange={(_, v) => onChannelsChange({ ...channels, r: v, g: v, b: v })}
          />
        }
        label="Серый"
      />
      <FormControlLabel
        control={<Checkbox size="small" checked={channels.a} onChange={(_, v) => setChannel('a', v)} />}
        label="Альфа"
      />
    </FormGroup>
  ) : (
    <FormGroup row>
      <FormControlLabel
        control={<Checkbox size="small" checked={channels.r} onChange={(_, v) => setChannel('r', v)} />}
        label="R"
      />
      <FormControlLabel
        control={<Checkbox size="small" checked={channels.g} onChange={(_, v) => setChannel('g', v)} />}
        label="G"
      />
      <FormControlLabel
        control={<Checkbox size="small" checked={channels.b} onChange={(_, v) => setChannel('b', v)} />}
        label="B"
      />
      <FormControlLabel
        control={<Checkbox size="small" checked={channels.a} onChange={(_, v) => setChannel('a', v)} />}
        label="A"
      />
    </FormGroup>
  );

  const sum = localKernel.reduce((acc, v) => acc + (parseFloat(v) || 0), 0);

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
      <DialogTitle>Фильтрация (свёртка 3×3)</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="body2" sx={{ minWidth: 70 }}>
              Пресет
            </Typography>
            <Select
              size="small"
              value={presetKey}
              onChange={(e) => onPresetChange(e.target.value)}
              sx={{ flex: 1 }}
            >
              {PRESETS.map((p) => (
                <MenuItem key={p.key} value={p.key}>
                  {p.label}
                </MenuItem>
              ))}
              {!PRESETS.some((p) => p.key === presetKey) && (
                <MenuItem value="custom">Пользовательское</MenuItem>
              )}
            </Select>
            <Tooltip title={presetInfo?.description ?? 'Пользовательское ядро'} placement="top" arrow>
              <HelpOutlineIcon fontSize="small" sx={{ color: 'text.secondary' }} />
            </Tooltip>
          </Stack>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="body2" sx={{ minWidth: 70 }}>
              Метод
            </Typography>
            <Select
              size="small"
              value={mode}
              onChange={(e) => onModeChange(e.target.value as FilterMode)}
              sx={{ flex: 1 }}
            >
              <MenuItem value="kernel">Свертка ядром 3x3</MenuItem>
              <MenuItem value="median3">Медианный фильтр 3x3</MenuItem>
            </Select>
          </Stack>

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Ядро
            </Typography>
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(${KERNEL_SIZE}, 1fr)`,
                gap: 1,
              }}
            >
              {localKernel.map((v, idx) => (
                <TextField
                  key={idx}
                  size="small"
                  value={v}
                  onChange={(e) => updateCell(idx, e.target.value)}
                  disabled={mode === 'median3'}
                  inputProps={{ inputMode: 'decimal', style: { textAlign: 'center' } }}
                />
              ))}
            </Box>
            <Typography variant="caption" color="text.secondary">
              Сумма коэффициентов: {sum.toFixed(4)}
            </Typography>
          </Box>

          <Box>
            <Typography variant="body2" sx={{ mb: 0.5 }}>
              Каналы
            </Typography>
            {channelControls}
          </Box>

          <Stack direction="row" spacing={1.5} alignItems="center">
            <Typography variant="body2" sx={{ minWidth: 70 }}>
              Края
            </Typography>
            <Select
              size="small"
              value={padding}
              onChange={(e) => onPaddingChange(e.target.value as PaddingMode)}
              sx={{ flex: 1 }}
            >
              {(Object.keys(PADDING_LABELS) as PaddingMode[]).map((k) => (
                <MenuItem key={k} value={k}>
                  {PADDING_LABELS[k]}
                </MenuItem>
              ))}
            </Select>
          </Stack>

          <FormControlLabel
            control={<Checkbox size="small" checked={preview} onChange={(_, v) => onPreviewChange(v)} />}
            label={busy ? 'Предпросмотр на холсте (вычисление...)' : 'Предпросмотр на холсте'}
          />
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onReset}>Сброс</Button>
        <Box sx={{ flex: 1 }} />
        <Button onClick={onCancel}>Отмена</Button>
        <Button onClick={onApply} variant="contained" disabled={busy}>
          Применить
        </Button>
      </DialogActions>
    </Dialog>
  );
}
