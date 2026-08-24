import { AlertTriangle } from 'lucide-react';

export function CandidateReadOnlyBanner({ assigneeName }: { assigneeName?: string | null }) {
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 text-amber-900 px-4 py-3 text-sm flex gap-3 items-start">
      <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold">Faqat ko‘rish rejimi</p>
        <p className="mt-0.5 text-amber-800/90">
          Bu suhbatni faqat biriktirilgan mas’ul
          {assigneeName ? ` (${assigneeName})` : ''} va HR o‘zgartira oladi. Siz ma’lumotni ko‘ra olasiz,
          lekin saqlash mumkin emas.
        </p>
      </div>
    </div>
  );
}
