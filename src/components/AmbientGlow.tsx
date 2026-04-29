export default function AmbientGlow() {
  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      <div className="absolute top-[-20%] left-[30%] w-[600px] h-[600px] rounded-full bg-violet/10 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[20%] w-[500px] h-[400px] rounded-full bg-accent/10 blur-[100px]" />
    </div>
  );
}
