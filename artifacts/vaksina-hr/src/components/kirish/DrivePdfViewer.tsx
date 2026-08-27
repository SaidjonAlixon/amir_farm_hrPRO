export function DrivePdfViewer({ fileId }: { fileId: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
      <iframe
        title="Slayd PDF"
        src={`https://drive.google.com/file/d/${fileId}/preview`}
        className="h-[min(70vh,720px)] min-h-[420px] w-full border-0"
        allow="fullscreen"
      />
    </div>
  );
}
