import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, LogOut, Trash2, Camera, ImageIcon } from "lucide-react";

interface Photo {
  id: string;
  file_name: string;
  file_path: string;
  created_at: string;
}

const Gallery = () => {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate("/auth");
        return;
      }
      setUserId(session.user.id);
    };
    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) navigate("/auth");
      else setUserId(session.user.id);
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const fetchPhotos = useCallback(async () => {
    if (!userId) return;
    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("Erro ao carregar fotos");
      return;
    }
    setPhotos(data || []);
  }, [userId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  const uploadFile = async (file: File) => {
    if (!userId) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Apenas imagens são permitidas");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Arquivo muito grande (máx 10MB)");
      return;
    }

    setUploading(true);
    const fileExt = file.name.split(".").pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage
        .from("photos")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase.from("photos").insert({
        user_id: userId,
        file_name: file.name,
        file_path: filePath,
        file_size: file.size,
      });
      if (dbError) throw dbError;

      toast.success("Foto enviada com sucesso!");
      fetchPhotos();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) Array.from(files).forEach(uploadFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = e.dataTransfer.files;
    if (files) Array.from(files).forEach(uploadFile);
  };

  const deletePhoto = async (photo: Photo) => {
    try {
      const { error: storageError } = await supabase.storage
        .from("photos")
        .remove([photo.file_path]);
      if (storageError) throw storageError;

      const { error: dbError } = await supabase
        .from("photos")
        .delete()
        .eq("id", photo.id);
      if (dbError) throw dbError;

      toast.success("Foto excluída");
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const getPublicUrl = (filePath: string) => {
    const { data } = supabase.storage.from("photos").getPublicUrl(filePath);
    return data.publicUrl;
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Camera className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-xl font-bold font-display text-foreground">PhotoVault</h1>
          </div>
          <div className="flex items-center gap-3">
            <label>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileChange}
                className="hidden"
                disabled={uploading}
              />
              <Button asChild variant="default" size="sm" className="gap-2 cursor-pointer" disabled={uploading}>
                <span>
                  <Upload className="w-4 h-4" />
                  {uploading ? "Enviando..." : "Upload"}
                </span>
              </Button>
            </label>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Sair">
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={`mb-8 border-2 border-dashed rounded-2xl p-10 text-center transition-all ${
            dragOver
              ? "border-primary bg-primary/5"
              : "border-border hover:border-muted-foreground/30"
          }`}
        >
          <ImageIcon className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
          <p className="text-muted-foreground font-medium">
            Arraste fotos aqui ou clique em Upload
          </p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            PNG, JPG, WEBP até 10MB
          </p>
        </div>

        {/* Gallery grid */}
        {photos.length === 0 ? (
          <div className="text-center py-20 animate-fade-in">
            <Camera className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
            <p className="text-muted-foreground text-lg">Nenhuma foto ainda</p>
            <p className="text-muted-foreground/60 text-sm mt-1">
              Faça upload da sua primeira foto!
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 animate-fade-in">
            {photos.map((photo) => (
              <div
                key={photo.id}
                className="group relative aspect-square rounded-xl overflow-hidden bg-muted border border-border hover:border-primary/30 transition-all animate-scale-in"
              >
                <img
                  src={getPublicUrl(photo.file_path)}
                  alt={photo.file_name}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-foreground/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between">
                  <p className="text-primary-foreground text-xs truncate max-w-[70%]">
                    {photo.file_name}
                  </p>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="w-8 h-8 shrink-0"
                    onClick={() => deletePhoto(photo)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Gallery;
