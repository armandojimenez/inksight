import { Toaster } from 'sonner';
import { AppLayout } from '@/components/AppLayout';

function App() {
  return (
    <>
      <AppLayout />
      <Toaster
        position="bottom-right"
        toastOptions={{
          classNames: {
            success: 'border-l-4 border-l-success-500',
            error: 'border-l-4 border-l-error-500',
          },
        }}
      />
    </>
  );
}

export default App;
