import { Toaster } from 'sonner';
import { UploadView } from '@/components/UploadView';

function App() {
  return (
    <>
      <UploadView
        onUploadComplete={(image) => {
          // eslint-disable-next-line no-console
          console.log('Upload complete:', image);
        }}
      />
      <Toaster position="bottom-right" />
    </>
  );
}

export default App;
