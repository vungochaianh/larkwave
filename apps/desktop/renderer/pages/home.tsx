import Head from 'next/head';
import { HomeScreen } from '@larkwave/ui';

export default function Home() {
  return (
    <>
      <Head>
        <title>Larkwave Desktop</title>
      </Head>
      <HomeScreen />
    </>
  );
}
