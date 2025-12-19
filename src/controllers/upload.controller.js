import { createUploadTarget } from "../services/storage.service.js";
import { updateSongMedia } from "../services/song.service.js";
import { updateAlbumCover } from "../services/album.service.js";
import { errorResponse, successResponse } from "../utils/response.js";

const allowedResourceTypes = ["song", "album"];
const allowedMediaTypes = ["audio", "cover"];

const isAlbumCoverRequest = (resourceType, mediaType) =>
  resourceType === "album" && mediaType === "cover";

export const requestUpload = async (req, res, next) => {
  try {
    const { resourceType, resourceId, mediaType, fileName, contentType } =
      req.body;

    if (!allowedResourceTypes.includes(resourceType)) {
      return errorResponse(res, "Invalid resource type", 400);
    }

    if (!allowedMediaTypes.includes(mediaType)) {
      return errorResponse(res, "Invalid media type", 400);
    }

    if (!resourceId || !fileName || !contentType) {
      return errorResponse(
        res,
        "resourceId, fileName and contentType are required",
        400
      );
    }

    if (resourceType === "album" && mediaType !== "cover") {
      return errorResponse(res, "Albums only support cover uploads", 400);
    }

    const uploadTarget = await createUploadTarget({
      resourceType,
      mediaType,
      fileName,
      contentType,
    });

    if (resourceType === "song") {
      const mediaPayload =
        mediaType === "audio"
          ? { audioPath: uploadTarget.publicUrl || uploadTarget.path }
          : { coverUrl: uploadTarget.publicUrl || uploadTarget.path };

      await updateSongMedia(resourceId, mediaPayload);
    } else if (isAlbumCoverRequest(resourceType, mediaType)) {
      await updateAlbumCover(
        resourceId,
        uploadTarget.publicUrl || uploadTarget.path
      );
    }

    return successResponse(res, uploadTarget, null, 201);
  } catch (error) {
    return next(error);
  }
};

export default {
  requestUpload,
};
