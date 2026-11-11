import { useEffect, useMemo, useRef } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { IMAGE_TYPES, validateImage } from '@/lib/solutionRequests';
import { useBilingual } from './hooks';

/** Keeps already-saved images (paths) and new files apart; new files are uploaded on submit. */
export default function ImagePicker({ existing, files, max, urls, onChange, id }: {
  existing: string[]; files: File[]; max: number; urls: Record<string, string>;
  onChange: (existing: string[], files: File[]) => void; id: string;
}) {
  const { tt } = useBilingual();
  const { toast } = useToast();
  const input = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map(file => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);
  const room = max - existing.length - files.length;

  const add = (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (input.current) input.current.value = '';
    const ok: File[] = [];
    for (const file of picked) {
      const problem = validateImage(file);
      if (problem) { toast({ title: tt(problem), variant: 'destructive' }); continue; }
      ok.push(file);
    }
    if (ok.length > room) toast({ title: tt([`At most ${max} image${max > 1 ? 's' : ''}.`, `最多 ${max} 张图片。`]), variant: 'destructive' });
    onChange(existing, [...files, ...ok.slice(0, Math.max(room, 0))]);
  };

  const tile = 'relative h-20 w-20 overflow-hidden rounded-lg bg-muted';
  const remove = (label: string, onClick: () => void) => (
    <button type="button" onClick={onClick} aria-label={label}
      className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-background/90 text-foreground shadow">
      <X aria-hidden="true" className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="flex flex-wrap items-center gap-2">
      {existing.map((path, i) => (
        <div key={path} className={tile}>
          {urls[path] && <img src={urls[path]} alt="" className="h-full w-full object-cover" />}
          {remove(tt([`Remove image ${i + 1}`, `删除第 ${i + 1} 张图`]), () => onChange(existing.filter(p => p !== path), files))}
        </div>
      ))}
      {files.map((file, i) => (
        <div key={previews[i]} className={tile}>
          <img src={previews[i]} alt="" className="h-full w-full object-cover" />
          {remove(tt([`Remove ${file.name}`, `删除 ${file.name}`]), () => onChange(existing, files.filter((_, j) => j !== i)))}
        </div>
      ))}
      {room > 0 && (
        <>
          <input ref={input} id={id} type="file" accept={Object.keys(IMAGE_TYPES).join(',')} multiple={max > 1} className="sr-only"
            onChange={event => add(event.target.files)} />
          <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()}>
            <ImagePlus aria-hidden="true" className="mr-1.5 h-4 w-4" />
            {tt(max > 1 ? [`Add image (${room} left)`, `添加图片（还能加 ${room} 张）`] : ['Add image', '添加图片'])}
          </Button>
        </>
      )}
    </div>
  );
}
