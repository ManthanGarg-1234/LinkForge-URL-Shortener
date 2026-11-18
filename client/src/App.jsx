function App() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold tracking-tight">
          Link<span className="text-blue-500">Forge</span>
        </h1>

        <p className="text-zinc-400 text-lg">
          Smart links. Powerful analytics. Complete control.
        </p>

        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Frontend initialized successfully
        </div>
      </div>
    </main>
  );
}

export default App;