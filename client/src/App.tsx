import { Toaster } from 'sonner';

function App() {
  return (
    <>
      <div className="flex min-h-screen items-center justify-center bg-neutral-25 font-body">
        <h1 className="font-display text-3xl font-semibold text-neutral-700">
          Inksight — AI-powered visual assistant
        </h1>
      </div>
      <Toaster position="bottom-right" />
    </>
  );
}

export default App;
