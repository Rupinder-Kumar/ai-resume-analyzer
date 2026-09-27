export function LoadingState() {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 rounded-xl border border-gray-200 bg-white p-6 text-center sm:p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
      <p className="text-sm text-gray-500">
        Analyzing your resume against the job description...
      </p>
    </div>
  );
}
