import {
  useState,
  useEffect,
  useCallback,
} from "react";

import { supabase } from "@/integrations/supabase/client";

import { toast } from "@/hooks/use-toast";
import { useRealtime } from "@/hooks/use-realtime";
import { usePermissions } from "@/hooks/use-permissions";
import { useCompany } from "@/hooks/use-company";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

type Bloco = {
  id: string;
  nome: string;
  descricao?: string | null;
  company_id?: string;
};

export default function Blocos() {

const { companyId } = useCompany();

const [loading, setLoading] =
  useState(false);

const [dialogOpen, setDialogOpen] =
  useState(false);

const [nome, setNome] =
  useState("");

const [descricao, setDescricao] =
  useState("");

const [editingBloco, setEditingBloco] =
  useState<Bloco | null>(null);

const [blocos, setBlocos] =
  useState<Bloco[]>([]);

const { can } = usePermissions();

  const fetchBlocos = useCallback(async () => {
console.log("COMPANY ID FETCH:", companyId);
    if (!companyId) return;

    setLoading(true);

    const { data, error } =
      await (supabase as any)
        .from("blocos")
        .select("*")
        .eq("company_id", companyId)
        .order("nome");

    if (error) {

      toast({
        title: "Erro ao carregar blocos",
        description: error.message,
        variant: "destructive",
      });

    } else {

      setBlocos(data || []);
    }

    setLoading(false);

  }, [companyId]);

  useEffect(() => {
    fetchBlocos();
  }, [fetchBlocos]);

 useRealtime(
  ["blocos" as any],
  fetchBlocos,
  companyId
);

  const resetForm = () => {

    setNome("");
    setDescricao("");
    setEditingBloco(null);
  };

  const handleSave = async () => {

    if (!nome.trim()) {

      toast({
        title: "Nome obrigatório",
        variant: "destructive",
      });

      return;
    }

    if (!companyId) {

      toast({
        title: "Empresa não identificada",
        variant: "destructive",
      });

      return;
    }

    if (editingBloco) {

      const { error } =
        await (supabase as any)
          .from("blocos")
          .update({
            nome: nome.trim(),
          })
          .eq("id", editingBloco.id)
          .eq("company_id", companyId);

      if (error) {

        toast({
          title: "Erro ao atualizar",
          description: error.message,
          variant: "destructive",
        });

        return;
      }

      toast({
        title:
          "Bloco atualizado com sucesso",
      });

    } else {

      const { error } =
        await (supabase as any)
          .from("blocos")
          .insert({
            nome: nome.trim(),
            company_id: companyId,
          });

      if (error) {

        toast({
          title: "Erro ao criar",
          description: error.message,
          variant: "destructive",
        });

        return;
      }

      toast({
        title:
          "Bloco criado com sucesso",
      });
    }

    setDialogOpen(false);

    resetForm();

    fetchBlocos();
  };

  const handleEdit = (
    bloco: Bloco
  ) => {

    setEditingBloco(bloco);

    setNome(bloco.nome);

    setDescricao(
      bloco.descricao || ""
    );

    setDialogOpen(true);
  };

  const handleDelete = async (
    bloco: Bloco
  ) => {

    const confirmed =
      window.confirm(
        `Deseja excluir o bloco "${bloco.nome}"?`
      );

    if (!confirmed) return;

    const { error } =
      await (supabase as any)
        .from("blocos")
        .delete()
        .eq("id", bloco.id)
        .eq("company_id", companyId);

    if (error) {

      toast({
        title: "Erro ao excluir",
        description: error.message,
        variant: "destructive",
      });

      return;
    }

    toast({
      title:
        "Bloco excluído com sucesso",
    });

    fetchBlocos();
  };

  return (
    <div className="space-y-6">

      <div className="flex items-center justify-between">

        <div>
          <h1 className="text-3xl font-bold">
            Blocos
          </h1>

          <p className="text-muted-foreground">
            Gerencie os blocos da empresa
          </p>
        </div>

        {can("blocos.criar") && (
          <Button
            onClick={() => {
              resetForm();
              setDialogOpen(true);
            }}
          >
            Novo Bloco
          </Button>
        )}
      </div>

      <div className="rounded-md border">

        <Table>

          <TableHeader>
            <TableRow>
              <TableHead>
                Nome
              </TableHead>

              <TableHead>
                Descrição
              </TableHead>

              <TableHead className="w-[180px]">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>

            {loading ? (

              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center"
                >
                  Carregando...
                </TableCell>
              </TableRow>

            ) : blocos.length === 0 ? (

              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center"
                >
                  Nenhum bloco cadastrado.
                </TableCell>
              </TableRow>

            ) : (

              blocos.map((bloco) => (

                <TableRow key={bloco.id}>

                  <TableCell>
                    {bloco.nome}
                  </TableCell>

                  <TableCell>
                    {bloco.descricao || "—"}
                  </TableCell>

                  <TableCell className="space-x-2">

                    {can("blocos.editar") && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          handleEdit(bloco)
                        }
                      >
                        Editar
                      </Button>
                    )}

                    {can("blocos.excluir") && (
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() =>
                          handleDelete(bloco)
                        }
                      >
                        Excluir
                      </Button>
                    )}

                  </TableCell>

                </TableRow>
              ))
            )}

          </TableBody>

        </Table>

      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      >

        <DialogContent>

          <DialogHeader>

            <DialogTitle>

              {editingBloco
                ? "Editar Bloco"
                : "Novo Bloco"}

            </DialogTitle>

          </DialogHeader>

          <div className="space-y-4">

            <div className="space-y-2">

              <label className="text-sm font-medium">
                Nome
              </label>

              <Input
                value={nome}
                onChange={(e) =>
                  setNome(e.target.value)
                }
              />

            </div>

            <div className="space-y-2">

              <label className="text-sm font-medium">
                Descrição
              </label>

              <Textarea
                value={descricao}
                onChange={(e) =>
                  setDescricao(e.target.value)
                }
              />

            </div>

          </div>

          <DialogFooter>

            <Button
              variant="outline"
              onClick={() =>
                setDialogOpen(false)
              }
            >
              Cancelar
            </Button>

            <Button onClick={handleSave}>
              Salvar
            </Button>

          </DialogFooter>

        </DialogContent>

      </Dialog>

    </div>
  );
}