import { useRef, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Toolbar as MuiToolbar,
  Tooltip,
  Typography,
} from '@mui/material';
import FileUploadIcon from '@mui/icons-material/FileUpload';
import DownloadIcon from '@mui/icons-material/Download';
import ColorizeIcon from '@mui/icons-material/Colorize';
import PanToolIcon from '@mui/icons-material/PanTool';
import PhotoSizeSelectLargeIcon from '@mui/icons-material/PhotoSizeSelectLarge';
import TuneIcon from '@mui/icons-material/Tune';
import BlurOnIcon from '@mui/icons-material/BlurOn';
import type { ToolMode } from './types';

export type SaveFormat = 'png' | 'jpeg' | 'gb7';

interface Props {
  onLoad: (file: File) => void;
  onSave: (format: SaveFormat) => void;
  canSave: boolean;
  tool: ToolMode;
  onToolChange: (tool: ToolMode) => void;
  onOpenLevels: () => void;
  onOpenResize: () => void;
  onOpenFilter: () => void;
}

export function Toolbar({
  onLoad,
  onSave,
  canSave,
  tool,
  onToolChange,
  onOpenLevels,
  onOpenResize,
  onOpenFilter,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [anchor, setAnchor] = useState<null | HTMLElement>(null);

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onLoad(file);
    e.target.value = '';
  };

  const handleSave = (format: SaveFormat) => {
    setAnchor(null);
    onSave(format);
  };

  return (
    <AppBar
      position="static"
      color="default"
      elevation={0}
      sx={{
        borderBottom: '1px solid #5a2b38',
        background:
          'linear-gradient(90deg, rgba(38,22,29,1) 0%, rgba(53,27,35,1) 55%, rgba(72,28,40,1) 100%)',
      }}
    >
      <MuiToolbar variant="dense" sx={{ gap: 1, px: 1.5 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mr: 1 }}>
          PixelForge Lab
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ mr: 2 }}>
          редактор для курса компьютерной графики
        </Typography>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        <input
          ref={inputRef}
          type="file"
          accept=".png,.jpg,.jpeg,.gb7,image/png,image/jpeg"
          hidden
          onChange={handlePick}
        />
        <Button
          variant="contained"
          startIcon={<FileUploadIcon />}
          onClick={() => inputRef.current?.click()}
          sx={{ boxShadow: 'none' }}
        >
          Загрузить
        </Button>
        <Button
          variant="outlined"
          startIcon={<DownloadIcon />}
          disabled={!canSave}
          onClick={(e) => setAnchor(e.currentTarget)}
        >
          Скачать
        </Button>
        <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
          <MenuItem onClick={() => handleSave('png')}>PNG (.png)</MenuItem>
          <MenuItem onClick={() => handleSave('jpeg')}>JPEG (.jpg)</MenuItem>
          <MenuItem onClick={() => handleSave('gb7')}>GrayBit-7 (.gb7)</MenuItem>
        </Menu>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        <Tooltip title="Перемещение (рука)">
          <span>
            <IconButton
              size="small"
              color={tool === 'hand' ? 'primary' : 'default'}
              onClick={() => onToolChange('hand')}
            >
              <PanToolIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>
        <Tooltip title="Пипетка: клик по пикселю показывает цвет">
          <span>
            <IconButton
              size="small"
              color={tool === 'eyedropper' ? 'primary' : 'default'}
              onClick={() => onToolChange('eyedropper')}
              disabled={!canSave}
            >
              <ColorizeIcon fontSize="small" />
            </IconButton>
          </span>
        </Tooltip>

        <Divider orientation="vertical" flexItem sx={{ mx: 1 }} />

        <Tooltip title="Уровни: гистограмма и градационная коррекция">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<TuneIcon />}
              onClick={onOpenLevels}
              disabled={!canSave}
            >
              Уровни
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Изменить размер изображения с выбором алгоритма интерполяции">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<PhotoSizeSelectLargeIcon />}
              onClick={onOpenResize}
              disabled={!canSave}
            >
              Размер
            </Button>
          </span>
        </Tooltip>
        <Tooltip title="Фильтрация ядром 3x3: резкость, размытие, контуры">
          <span>
            <Button
              size="small"
              variant="outlined"
              startIcon={<BlurOnIcon />}
              onClick={onOpenFilter}
              disabled={!canSave}
            >
              Фильтр
            </Button>
          </span>
        </Tooltip>

        <Box sx={{ flex: 1 }} />
      </MuiToolbar>
    </AppBar>
  );
}
