import { Routes, Route } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AppLayout } from '@/components/AppLayout';
import { LandingPage } from '@/components/LandingPage';
import { ErrorBoundary } from '@/components/ErrorBoundary';

function App() {
  return (
    <>
      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/app" element={<AppLayout />} />
        </Routes>
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
