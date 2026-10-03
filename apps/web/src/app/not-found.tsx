import Link from "next/link";

export default function NotFound() {
  return (
    <div className="p-8 text-center space-y-3">
      <div className="text-4xl">🧭</div>
      <h1 className="text-xl font-bold">Not found</h1>
      <Link href="/" className="btn btn-primary">Back to Go</Link>
    </div>
  );
}
