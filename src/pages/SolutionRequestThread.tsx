import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import ThreadView from '@/components/solution-requests/ThreadView';
import { useBilingual } from '@/components/solution-requests/hooks';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SolutionRequestThread() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { tt } = useBilingual();
  const back = () => navigate('/solution-requests');

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link to="/solution-requests" className="mb-6 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft aria-hidden="true" className="mr-1.5 h-4 w-4" />{tt(['All questions', '返回答疑区'])}
        </Link>
        {UUID.test(id)
          ? <ThreadView id={id.toLowerCase()} onGone={back} />
          : <p className="py-12 text-center text-muted-foreground">{tt(['This question is not available.', '这个问题不存在或已被撤回。'])}</p>}
      </div>
    </div>
  );
}
