import { Preview } from '@/components/preview';

export default async function Page({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  return <Preview id={(await params).id} />;
}
