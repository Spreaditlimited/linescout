export default function TikTokIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M19.321 5.562a5.124 5.124 0 0 1-.443-.258 6.228 6.228 0 0 1-1.137-.966c-.849-.963-1.166-2.14-1.166-2.14h-3.297v14.866c0 2.963-2.4 5.363-5.363 5.363a5.363 5.363 0 1 1 5.363-5.363c0 .262-.02.519-.058.771v-3.32c-.262.037-.533.056-.809.056-2.963 0-5.363-2.4-5.363-5.363 0-2.963 2.4-5.363 5.363-5.363.277 0 .547.02.809.057V.875c2.891.148 5.174 2.431 5.322 5.322.037.294.055.593.055.896v7.188a9.003 9.003 0 0 0 5.725-2.115V8.833a8.989 8.989 0 0 1-5.001-3.271z"
        fill="url(#linescout-tiktok-gradient)"
      />
      <defs>
        <linearGradient id="linescout-tiktok-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF0050" />
          <stop offset="100%" stopColor="#00F2EA" />
        </linearGradient>
      </defs>
    </svg>
  );
}
