export const createArtistRequestSchema = {
  body: {
    artist_name: { type: "string", required: true, minLength: 2 },
    bio: { type: "string", required: false },
    avatar_url: { type: "string", required: false },
    proof_link: { type: "string", required: false },
  },
};

export default {
  createArtistRequestSchema,
};
