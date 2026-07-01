import type { Metadata } from "next";

import { VideoUploadForm } from "@/components/upload/video-upload-form";

export const metadata: Metadata = {
  title: "Enviar vídeo — StreamTube",
};

export default function UploadPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-h1 text-foreground">Enviar vídeo</h1>
        <p className="text-body-md text-muted-foreground mt-1">
          Faça o upload do seu vídeo. Após o upload, você poderá adicionar título,
          descrição e thumbnail no Studio.
        </p>
      </div>
      <VideoUploadForm />
    </div>
  );
}
