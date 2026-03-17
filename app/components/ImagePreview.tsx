"use client";

interface ImagePreviewProps {
  images: string[];
  onRemove?: (index: number) => void;
  small?: boolean;
}

export default function ImagePreview({ images, onRemove, small }: ImagePreviewProps) {
  if (images.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      {images.map((img, i) => (
        <div key={i} className="relative group">
          {img.toLowerCase().endsWith(".pdf") ? (
            <div className={`rounded-lg bg-gray-700 flex items-center justify-center ${small ? "w-16 h-16" : "w-24 h-24"}`}>
              <span className="text-red-400 text-xs font-bold">PDF</span>
            </div>
          ) : (
            <img
              src={`/api/uploads/${img.replace("data/uploads/", "")}`}
              alt="upload"
              className={`rounded-lg object-cover ${small ? "w-16 h-16" : "w-24 h-24"}`}
            />
          )}
          {onRemove && (
            <button
              onClick={() => onRemove(i)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              x
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
