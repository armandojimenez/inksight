import { useState } from 'react';
import { Toaster, toast } from 'sonner';
import { UploadView } from '@/components/UploadView';
import type { UploadResponse } from '@/types';

function App() {
  const [uploaded, setUploaded] = useState<UploadResponse | null>(null);

  return (
    <>
      {uploaded ? (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-25 p-8">
          <div className="rounded border border-success-500 bg-success-50 p-6 text-center">
            <p className="font-display text-xl font-semibold text-neutral-700">
              Upload successful!
            </p>
            <p className="mt-2 text-sm text-neutral-500">
              ID: {uploaded.id}
            </p>
            <p className="text-sm text-neutral-500">
              File: {uploaded.filename} ({(uploaded.size / 1024).toFixed(1)} KB)
            </p>
          </div>
          <button
            className="rounded bg-primary-500 px-4 py-2 text-sm font-bold text-white hover:bg-primary-600"
            onClick={() => setUploaded(null)}
          >
            Upload another
          </button>
        </div>
      ) : (
        <UploadView
          onUploadComplete={(image) => {
            setUploaded(image);
            toast.success(`Uploaded ${image.filename}`);
          }}
        />
      )}
      <Toaster position="bottom-right" />
    </>
  );
}

export default App;
