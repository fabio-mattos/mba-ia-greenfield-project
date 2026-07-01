import { handlers as authHandlers } from "./auth";
import { handlers as seedHandlers } from "./_seed";
import { handlers as videosHandlers } from "./videos";
import { handlers as commentsHandlers } from "./comments";

export const handlers = [
  ...authHandlers,
  ...seedHandlers,
  ...videosHandlers,
  ...commentsHandlers,
];
