import { Toaster } from 'sonner';
import { AppLayout } from '@/components/AppLayout';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function App() {
  return (
    <>
      <ErrorBoundary>
        <AppLayout />
      </ErrorBoundary>
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
