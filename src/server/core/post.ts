import { reddit, EntrypointHeight } from '@devvit/web/server';

export const createPost = async () => {
  return await reddit.submitCustomPost({
    title: 'resonance-fld',
    styles: {
      height: EntrypointHeight.TALL,
      backgroundColor: '#0d0e15ff',
    },
  });
};
