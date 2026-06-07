import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Box, Snackbar } from '@mui/material';
import { Toolbar, type SaveFormat } from './Toolbar';
import { ImageCanvas } from './ImageCanvas';
import { StatusBar } from './StatusBar';
import { SidePanel } from './SidePanel';
import { LevelsDialog } from './LevelsDialog';
import { ResizeDialog } from './ResizeDialog';
import { FilterDialog } from './FilterDialog';
import type { PixelImage, PixelSample, ToolMode } from './types';
import { encodeToBlob, loadImageFile, triggerDownload } from './imageIO';
import { defaultMask, type ChannelMask } from './channels';
import {
  type AllLevels,
  applyAllLevels,
  defaultAllLevels,
  isAllIdentity,
} from './levels';
import { resampleImage, type ResampleAlgorithm } from './resample';
import {
  type FilterMode,
  getPreset,
  type ChannelMaskRGBA,
  type PaddingMode,
} from './convolution';
import { convolveImage } from './convolutionClient';

const ZOOM_MIN = 0.12;
const ZOOM_MAX = 3.0;
const FIT_PADDING = 50;

const IDENTITY_KERNEL = ['0', '0', '0', '0', '1', '0', '0', '0', '0'];
const DEFAULT_FILTER_CHANNELS: ChannelMaskRGBA = { r: true, g: true, b: true, a: false };

function baseName(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

function clampZoom(z: number): number {
  return Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
}

function computeFitZoom(
  imgW: number,
  imgH: number,
  contW: number,
  contH: number,
): number {
  if (contW <= 0 || contH <= 0 || imgW <= 0 || imgH <= 0) return 1;
  const availW = Math.max(1, contW - FIT_PADDING * 2);
  const availH = Math.max(1, contH - FIT_PADDING * 2);
  const fit = Math.min(availW / imgW, availH / imgH, 1);
  return clampZoom(fit);
}

function kernelToNumbers(k: string[]): number[] {
  return k.map((s) => {
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  });
}

function isIdentityKernel(k: string[]): boolean {
  const n = kernelToNumbers(k);
  return n[4] === 1 && n.every((v, i) => (i === 4 ? true : v === 0));
}

function isFilterNoop(mode: FilterMode, kernel: string[]): boolean {
  if (mode === 'median3') return false;
  return isIdentityKernel(kernel);
}

export default function App() {
  const [image, setImage] = useState<PixelImage | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mask, setMask] = useState<ChannelMask>(defaultMask);
  const [tool, setTool] = useState<ToolMode>('hand');
  const [sample, setSample] = useState<PixelSample | null>(null);
  const [zoom, setZoom] = useState<number>(1);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const fitOnNextRef = useRef(false);

  const [levelsOpen, setLevelsOpen] = useState(false);
  const [levels, setLevels] = useState<AllLevels>(defaultAllLevels);
  const [livePreview, setLivePreview] = useState(true);
  const [previewImage, setPreviewImage] = useState<PixelImage | null>(null);
  const rafRef = useRef<number | null>(null);

  const [resizeOpen, setResizeOpen] = useState(false);

  const [filterOpen, setFilterOpen] = useState(false);
  const [filterPreset, setFilterPreset] = useState('identity');
  const [filterMode, setFilterMode] = useState<FilterMode>('kernel');
  const [filterKernel, setFilterKernel] = useState<string[]>(IDENTITY_KERNEL);
  const [filterPadding, setFilterPadding] = useState<PaddingMode>('replicate');
  const [filterChannels, setFilterChannels] = useState<ChannelMaskRGBA>(DEFAULT_FILTER_CHANNELS);
  const [filterPreview, setFilterPreview] = useState(true);
  const [filterBusy, setFilterBusy] = useState(false);
  const [filterPreviewImage, setFilterPreviewImage] = useState<PixelImage | null>(null);
  const filterJobRef = useRef(0);

  useEffect(() => {
    const url = new URLSearchParams(window.location.search).get('sample');
    if (!url) return;
    fetch(url)
      .then((r) => r.blob())
      .then((b) => handleLoad(new File([b], url.split('/').pop() || 'sample')))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!image || !levelsOpen || !livePreview || isAllIdentity(levels)) {
      setPreviewImage(null);
      return;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
    }
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      setPreviewImage(applyAllLevels(image, levels));
    });
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [image, levels, levelsOpen, livePreview]);

  useEffect(() => {
    if (!image || !filterOpen || !filterPreview || isFilterNoop(filterMode, filterKernel)) {
      setFilterPreviewImage(null);
      setFilterBusy(false);
      return;
    }
    const job = ++filterJobRef.current;
    setFilterBusy(true);
    convolveImage(image, kernelToNumbers(filterKernel), filterPadding, filterChannels, filterMode).then((res) => {
      if (filterJobRef.current !== job) return;
      setFilterPreviewImage(res);
      setFilterBusy(false);
    });
  }, [image, filterOpen, filterPreview, filterKernel, filterPadding, filterChannels, filterMode]);

  useEffect(() => {
    if (!image || !fitOnNextRef.current) return;
    if (containerSize.width === 0 || containerSize.height === 0) return;
    const z = computeFitZoom(image.width, image.height, containerSize.width, containerSize.height);
    setZoom(z);
    fitOnNextRef.current = false;
  }, [image, containerSize]);

  const displayImage = useMemo(() => {
    if (!image) return null;
    if (levelsOpen && livePreview && previewImage) return previewImage;
    if (filterOpen && filterPreview && filterPreviewImage) return filterPreviewImage;
    return image;
  }, [image, previewImage, filterPreviewImage, levelsOpen, livePreview, filterOpen, filterPreview]);

  const handleContainerSize = useCallback((s: { width: number; height: number }) => {
    setContainerSize(s);
  }, []);

  const handleFit = () => {
    if (!image) return;
    const z = computeFitZoom(image.width, image.height, containerSize.width, containerSize.height);
    setZoom(z);
  };

  const handleLoad = async (file: File) => {
    try {
      const loaded = await loadImageFile(file);
      fitOnNextRef.current = true;
      setImage(loaded);
      setFileName(file.name);
      setMask(defaultMask());
      setSample(null);
      setLevels(defaultAllLevels());
      setPreviewImage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки файла');
    }
  };

  const handleSave = async (format: SaveFormat) => {
    if (!image) return;
    try {
      const blob = await encodeToBlob(image, format);
      const ext = format === 'jpeg' ? 'jpg' : format;
      const name = `${fileName ? baseName(fileName) : 'image'}.${ext}`;
      triggerDownload(blob, name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка сохранения файла');
    }
  };

  const openLevels = () => {
    if (!image) return;
    setLevels(defaultAllLevels());
    setLivePreview(true);
    setLevelsOpen(true);
  };

  const closeLevels = () => {
    setLevelsOpen(false);
    setLevels(defaultAllLevels());
    setPreviewImage(null);
  };

  const resetLevels = () => {
    setLevels(defaultAllLevels());
  };

  const applyLevels = () => {
    if (image) {
      const next = applyAllLevels(image, levels);
      setImage(next);
      setSample(null);
    }
    setLevelsOpen(false);
    setLevels(defaultAllLevels());
    setPreviewImage(null);
  };

  const openResize = () => {
    if (!image) return;
    setResizeOpen(true);
  };

  const handleResizeApply = (width: number, height: number, algorithm: ResampleAlgorithm) => {
    if (!image) return;
    try {
      const next = resampleImage(image, width, height, algorithm);
      fitOnNextRef.current = true;
      setImage(next);
      setSample(null);
      setMask(defaultMask());
      setResizeOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось изменить размер');
    }
  };

  const openFilter = () => {
    if (!image) return;
    setFilterPreset('identity');
    setFilterMode('kernel');
    setFilterKernel(IDENTITY_KERNEL);
    setFilterChannels(DEFAULT_FILTER_CHANNELS);
    setFilterPadding('replicate');
    setFilterPreview(true);
    setFilterPreviewImage(null);
    setFilterOpen(true);
  };

  const closeFilter = () => {
    setFilterOpen(false);
    setFilterPreviewImage(null);
    setFilterBusy(false);
  };

  const resetFilter = () => {
    setFilterPreset('identity');
    setFilterMode('kernel');
    setFilterKernel(IDENTITY_KERNEL);
    setFilterChannels(DEFAULT_FILTER_CHANNELS);
    setFilterPadding('replicate');
  };

  const handlePresetChange = (key: string) => {
    setFilterPreset(key);
    const preset = getPreset(key);
    if (preset) {
      setFilterMode(preset.mode ?? 'kernel');
      setFilterKernel(preset.values.map((v) => String(v)));
    }
  };

  const handleFilterModeChange = (mode: FilterMode) => {
    setFilterMode(mode);
    setFilterPreset('custom');
  };

  const handleKernelChange = (next: string[]) => {
    setFilterKernel(next);
    setFilterPreset('custom');
  };

  const applyFilter = async () => {
    if (!image) return;
    try {
      setFilterBusy(true);
      const next = await convolveImage(
        image,
        kernelToNumbers(filterKernel),
        filterPadding,
        filterChannels,
        filterMode,
      );
      setImage(next);
      setSample(null);
      setFilterOpen(false);
      setFilterPreviewImage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Не удалось применить фильтр');
    } finally {
      setFilterBusy(false);
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      <Toolbar
        onLoad={handleLoad}
        onSave={handleSave}
        canSave={Boolean(image)}
        tool={tool}
        onToolChange={setTool}
        onOpenLevels={openLevels}
        onOpenResize={openResize}
        onOpenFilter={openFilter}
      />
      <Box sx={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <ImageCanvas
          image={displayImage}
          mask={mask}
          tool={tool}
          onPick={setSample}
          zoom={zoom}
          onContainerSize={handleContainerSize}
        />
        <SidePanel
          image={image}
          mask={mask}
          onMaskChange={setMask}
          sample={sample}
          toolActive={tool === 'eyedropper'}
        />
      </Box>
      <StatusBar
        image={image}
        fileName={fileName}
        zoom={zoom}
        onZoomChange={(z) => setZoom(clampZoom(z))}
        onFit={handleFit}
        zoomMin={ZOOM_MIN}
        zoomMax={ZOOM_MAX}
      />
      {image && (
        <LevelsDialog
          open={levelsOpen}
          image={image}
          preview={livePreview}
          levels={levels}
          onPreviewChange={setLivePreview}
          onLevelsChange={setLevels}
          onApply={applyLevels}
          onCancel={closeLevels}
          onReset={resetLevels}
        />
      )}
      {image && (
        <ResizeDialog
          open={resizeOpen}
          image={image}
          onApply={handleResizeApply}
          onCancel={() => setResizeOpen(false)}
        />
      )}
      {image && (
        <FilterDialog
          open={filterOpen}
          image={image}
          preview={filterPreview}
          busy={filterBusy}
          presetKey={filterPreset}
          mode={filterMode}
          kernel={filterKernel}
          padding={filterPadding}
          channels={filterChannels}
          onPreviewChange={setFilterPreview}
          onPresetChange={handlePresetChange}
          onModeChange={handleFilterModeChange}
          onKernelChange={handleKernelChange}
          onPaddingChange={setFilterPadding}
          onChannelsChange={setFilterChannels}
          onApply={applyFilter}
          onCancel={closeFilter}
          onReset={resetFilter}
        />
      )}
      <Snackbar
        open={Boolean(error)}
        autoHideDuration={5000}
        onClose={() => setError(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="error" onClose={() => setError(null)} variant="filled">
          {error}
        </Alert>
      </Snackbar>
    </Box>
  );
}
