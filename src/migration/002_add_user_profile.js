export const up = (pgm) => {
    pgm.addColumns("users", {
        name: { type: "text" },
        bio: { type: "text" },
        avatar_url: { type: "text" },
        social_links: { type: "jsonb", default: "{}" },
    });
};

export const down = (pgm) => {
    pgm.dropColumns("users", ["name", "bio", "avatar_url", "social_links"]);
};
