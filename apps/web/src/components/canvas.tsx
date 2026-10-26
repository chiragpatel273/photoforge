'use client';

import { useRef, useEffect, useState } from 'react';
import { Stage, Layer, Rect, Group, Image as KonvaImage, Text, Transformer } from 'react-konva';
import Konva from 'konva';
import { Element, Asset, BookDocument } from '@photoforge/shared';
import { useEditor } from '@/lib/editor-store';

function usePhoto(url?: string) {
  const [image, setImage] = useState<HTMLImageElement>();

  useEffect(() => {
    if (!url) return;
    let active = true;
    const img = new window.Image();

    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (active) setImage(img);
    };
    img.src = url;

    return () => {
      active = false;
    };
  }, [url]);

  return image;
}

function CanvasElement({
  element,
  asset,
  readOnly,
}: {
  element: Element;
  asset?: Asset;
  readOnly: boolean;
}) {
  const image = usePhoto(asset?.url);
  const state = useEditor();
  const shared = {
    id: element.id,
    x: element.x,
    y: element.y,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    draggable: !readOnly,
    onClick: () => !readOnly && state.select(element.id),
    onTap: () => !readOnly && state.select(element.id),
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) =>
      state.patch(element.id, { x: e.target.x(), y: e.target.y() }),
    onTransformEnd: (e: Konva.KonvaEventObject<Event>) => {
      const n = e.target;
      const width = Math.max(20, n.width() * n.scaleX());
      const height = Math.max(20, n.height() * n.scaleY());

      n.scaleX(1);
      n.scaleY(1);
      state.patch(element.id, {
        x: n.x(),
        y: n.y(),
        width,
        height,
        rotation: n.rotation(),
      });
    },
  };

  return element.type === 'placeholder' ? (
    <Group {...shared}>
      <Rect
        width={element.width}
        height={element.height}
        fill="#dce4d4"
        stroke="#b3c1a5"
        dash={[8, 8]}
        strokeWidth={2}
      />
      <Text
        text={element.label}
        y={element.height / 2 - 15}
        width={element.width}
        align="center"
        fontSize={24}
        fill="#93a780"
      />
    </Group>
  ) : element.type === 'text' ? (
    <Text
      {...shared}
      text={element.text}
      fontSize={element.fontSize}
      fontFamily={
        element.fontFamily === 'Times-Roman'
          ? 'Times New Roman'
          : element.fontFamily === 'Courier'
            ? 'Courier New'
            : 'Arial'
      }
      fill={element.color}
      align={element.align}
      lineHeight={1.2}
    />
  ) : image ? (
    <KonvaImage
      {...shared}
      image={image}
      crop={{
        x: element.crop.x * image.width,
        y: element.crop.y * image.height,
        width: element.crop.width * image.width,
        height: element.crop.height * image.height,
      }}
    />
  ) : (
    <Rect {...shared} fill="#e5e8e1" />
  );
}

export default function Canvas({
  assets,
  zoom = 1,
  readOnly = false,
  document: provided,
  pageIndex: providedIndex,
  onDropAsset,
}: {
  assets: Asset[];
  zoom?: number;
  readOnly?: boolean;
  document?: BookDocument;
  pageIndex?: number;
  onDropAsset?: (id: string, x: number, y: number) => void;
}) {
  const store = useEditor();
  const document = provided ?? store.document;
  const pageIndex = providedIndex ?? store.pageIndex;
  const outer = useRef<HTMLDivElement>(null);
  const stage = useRef<Konva.Stage>(null);
  const transformer = useRef<Konva.Transformer>(null);
  const [available, setAvailable] = useState(560);

  useEffect(() => {
    if (!outer.current) return;
    const observer = new ResizeObserver((entries) =>
      setAvailable(Math.max(180, (entries[0]?.contentRect.width ?? 640) - 80)),
    );

    observer.observe(outer.current);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (readOnly) return;
    const selected = store.selected ? stage.current?.findOne('#' + store.selected) : null;

    transformer.current?.nodes(selected ? [selected] : []);
  }, [store.selected, document, pageIndex, readOnly]);

  if (!document) return null;
  const page = document.pages[pageIndex];

  if (!page) return null;
  const width = Math.min(580, available) * zoom;
  const scale = width / 1000;
  const height = (1000 * document.heightMm) / document.widthMm;

  return (
    <div ref={outer} className="canvas-outer">
      <div
        className="canvas-paper"
        style={{ width, height: height * scale }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const id = e.dataTransfer.getData('application/photoforge-asset');
          const r = e.currentTarget.getBoundingClientRect();

          if (id) onDropAsset?.(id, (e.clientX - r.left) / scale, (e.clientY - r.top) / scale);
        }}
      >
        <Stage
          ref={stage}
          width={width}
          height={height * scale}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage() || e.target.name() === 'page-background')
              store.select(null);
          }}
        >
          <Layer>
            <Rect name="page-background" width={1000} height={height} fill={page.background} />
            {page.elements
              .filter((el) => !readOnly || el.type !== 'placeholder')
              .map((el) => (
                <CanvasElement
                  key={el.id}
                  element={el}
                  asset={el.type === 'image' ? assets.find((a) => a.id === el.assetId) : undefined}
                  readOnly={readOnly}
                />
              ))}
            {!readOnly && (
              <Transformer
                ref={transformer}
                flipEnabled={false}
                rotateEnabled
                boundBoxFunc={(old, next) =>
                  Math.abs(next.width) < 20 || Math.abs(next.height) < 20 ? old : next
                }
              />
            )}
          </Layer>
        </Stage>
        {!readOnly && (
          <div
            className="safe-guide"
            style={{ inset: `${(document.bleedMm / document.widthMm) * 100}%` }}
          />
        )}
      </div>
    </div>
  );
}
