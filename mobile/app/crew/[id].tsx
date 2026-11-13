import { Redirect, useLocalSearchParams } from 'expo-router';

/** Deep link kumi://crew/<id> opens that crew's room. */
export default function CrewLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/chat/c-${Number(id ?? 0) || 0}`} />;
}
