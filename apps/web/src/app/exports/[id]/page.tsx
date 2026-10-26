import { ExportPage } from '@/components/export';

export default async function Page({
  params,
}: {
  params: Promise<{
    id: string;
  }>;
}) {
  return <ExportPage id={(await params).id} />;
}
