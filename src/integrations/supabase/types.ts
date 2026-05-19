export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          action_type: string
          created_at: string
          description: string | null
          device: string | null
          id: string
          ip: string | null
          module: string | null
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
          user_name: string | null
        }
        Insert: {
          action_type: string
          created_at?: string
          description?: string | null
          device?: string | null
          id?: string
          ip?: string | null
          module?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
          user_name?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string
          description?: string | null
          device?: string | null
          id?: string
          ip?: string | null
          module?: string | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
          user_name?: string | null
        }
        Relationships: []
      }
      anexos_os: {
        Row: {
          bucket_name: string
          created_at: string | null
          file_path: string | null
          id: string
          nome_arquivo: string
          os_id: string
          tamanho_arquivo: number | null
          tipo_arquivo: string | null
          url_arquivo: string
        }
        Insert: {
          bucket_name?: string
          created_at?: string | null
          file_path?: string | null
          id?: string
          nome_arquivo: string
          os_id: string
          tamanho_arquivo?: number | null
          tipo_arquivo?: string | null
          url_arquivo: string
        }
        Update: {
          bucket_name?: string
          created_at?: string | null
          file_path?: string | null
          id?: string
          nome_arquivo?: string
          os_id?: string
          tamanho_arquivo?: number | null
          tipo_arquivo?: string | null
          url_arquivo?: string
        }
        Relationships: [
          {
            foreignKeyName: "anexos_os_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      atividades_ordem_preventiva: {
        Row: {
          concluido: boolean
          concluido_em: string | null
          concluido_por: string | null
          created_at: string
          data_inicio: string | null
          data_termino: string | null
          descricao: string | null
          id: string
          nome: string
          ordem: number
          ordem_preventiva_id: string
          responsavel: string | null
          status: string
          timer_paused_at: string | null
          timer_started_at: string | null
          timer_status: string
          timer_total_seconds: number
          timer_user_id: string | null
          tipo_atividade: string | null
          tipo_medicao: string | null
          unidade_medicao: string | null
          updated_at: string
          valor_medido: string | null
        }
        Insert: {
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          data_inicio?: string | null
          data_termino?: string | null
          descricao?: string | null
          id?: string
          nome: string
          ordem?: number
          ordem_preventiva_id: string
          responsavel?: string | null
          status?: string
          timer_paused_at?: string | null
          timer_started_at?: string | null
          timer_status?: string
          timer_total_seconds?: number
          timer_user_id?: string | null
          tipo_atividade?: string | null
          tipo_medicao?: string | null
          unidade_medicao?: string | null
          updated_at?: string
          valor_medido?: string | null
        }
        Update: {
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          data_inicio?: string | null
          data_termino?: string | null
          descricao?: string | null
          id?: string
          nome?: string
          ordem?: number
          ordem_preventiva_id?: string
          responsavel?: string | null
          status?: string
          timer_paused_at?: string | null
          timer_started_at?: string | null
          timer_status?: string
          timer_total_seconds?: number
          timer_user_id?: string | null
          tipo_atividade?: string | null
          tipo_medicao?: string | null
          unidade_medicao?: string | null
          updated_at?: string
          valor_medido?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "atividades_ordem_preventiva_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_ordem_preventiva_ordem_preventiva_id_fkey"
            columns: ["ordem_preventiva_id"]
            isOneToOne: false
            referencedRelation: "ordens_preventivas"
            referencedColumns: ["id"]
          },
        ]
      }
      atividades_os: {
        Row: {
          company_id: string | null
          created_at: string
          data_inicio: string
          data_termino: string
          id: string
          nome: string
          os_id: string
          responsavel: string | null
          status: string
          timer_paused_at: string | null
          timer_started_at: string | null
          timer_status: string
          timer_total_seconds: number
          timer_user_id: string | null
          tipo_atividade: string | null
          tipo_medicao: string | null
          unidade_medicao: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          data_inicio: string
          data_termino: string
          id?: string
          nome: string
          os_id: string
          responsavel?: string | null
          status?: string
          timer_paused_at?: string | null
          timer_started_at?: string | null
          timer_status?: string
          timer_total_seconds?: number
          timer_user_id?: string | null
          tipo_atividade?: string | null
          tipo_medicao?: string | null
          unidade_medicao?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          data_inicio?: string
          data_termino?: string
          id?: string
          nome?: string
          os_id?: string
          responsavel?: string | null
          status?: string
          timer_paused_at?: string | null
          timer_started_at?: string | null
          timer_status?: string
          timer_total_seconds?: number
          timer_user_id?: string | null
          tipo_atividade?: string | null
          tipo_medicao?: string | null
          unidade_medicao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_os_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_os_timer_user_id_fkey"
            columns: ["timer_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      atividades_preventiva: {
        Row: {
          ativo_id: string | null
          automatico: boolean
          bloco_id: string | null
          concluido: boolean
          concluido_em: string | null
          concluido_por: string | null
          created_at: string
          descricao: string | null
          frequencia: string
          id: string
          nome: string
          ordem: number
          preventiva_id: string
          prioridade: string
          responsavel_id: string | null
          status: string
          tipo_atividade: string | null
          tipo_medicao: string | null
          tipo_servico: string | null
          unidade_medicao: string | null
          updated_at: string
        }
        Insert: {
          ativo_id?: string | null
          automatico?: boolean
          bloco_id?: string | null
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          descricao?: string | null
          frequencia?: string
          id?: string
          nome: string
          ordem?: number
          preventiva_id: string
          prioridade?: string
          responsavel_id?: string | null
          status?: string
          tipo_atividade?: string | null
          tipo_medicao?: string | null
          tipo_servico?: string | null
          unidade_medicao?: string | null
          updated_at?: string
        }
        Update: {
          ativo_id?: string | null
          automatico?: boolean
          bloco_id?: string | null
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          descricao?: string | null
          frequencia?: string
          id?: string
          nome?: string
          ordem?: number
          preventiva_id?: string
          prioridade?: string
          responsavel_id?: string | null
          status?: string
          tipo_atividade?: string | null
          tipo_medicao?: string | null
          tipo_servico?: string | null
          unidade_medicao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "atividades_preventiva_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "atividades_preventiva_preventiva_id_fkey"
            columns: ["preventiva_id"]
            isOneToOne: false
            referencedRelation: "manutencao_preventiva"
            referencedColumns: ["id"]
          },
        ]
      }
      ativos: {
        Row: {
          andar: string | null
          area_climatizada: number | null
          area_pavimento: string | null
          bloco_id: string | null
          capacidade_btu: number | null
          carga_termica: number | null
          categoria: string | null
          codigo_identificacao: string | null
          company_id: string | null
          corrente: number | null
          criado_em: string
          data_instalacao: string | null
          grupo_areas: string | null
          grupo_equipamentos: string | null
          id: string
          identificacao_ambiente: string | null
          marca: string | null
          modelo: string | null
          nome: string
          numero_serie: string | null
          observacoes: string | null
          ocupantes_fixos: number | null
          ocupantes_flutuantes: number | null
          patrimonio: string | null
          potencia: number | null
          responsavel_tecnico: string | null
          sala: string | null
          sistema: string | null
          status: string
          tensao: number | null
          tipo: string | null
          tipo_atividade: string | null
        }
        Insert: {
          andar?: string | null
          area_climatizada?: number | null
          area_pavimento?: string | null
          bloco_id?: string | null
          capacidade_btu?: number | null
          carga_termica?: number | null
          categoria?: string | null
          codigo_identificacao?: string | null
          company_id?: string | null
          corrente?: number | null
          criado_em?: string
          data_instalacao?: string | null
          grupo_areas?: string | null
          grupo_equipamentos?: string | null
          id?: string
          identificacao_ambiente?: string | null
          marca?: string | null
          modelo?: string | null
          nome: string
          numero_serie?: string | null
          observacoes?: string | null
          ocupantes_fixos?: number | null
          ocupantes_flutuantes?: number | null
          patrimonio?: string | null
          potencia?: number | null
          responsavel_tecnico?: string | null
          sala?: string | null
          sistema?: string | null
          status?: string
          tensao?: number | null
          tipo?: string | null
          tipo_atividade?: string | null
        }
        Update: {
          andar?: string | null
          area_climatizada?: number | null
          area_pavimento?: string | null
          bloco_id?: string | null
          capacidade_btu?: number | null
          carga_termica?: number | null
          categoria?: string | null
          codigo_identificacao?: string | null
          company_id?: string | null
          corrente?: number | null
          criado_em?: string
          data_instalacao?: string | null
          grupo_areas?: string | null
          grupo_equipamentos?: string | null
          id?: string
          identificacao_ambiente?: string | null
          marca?: string | null
          modelo?: string | null
          nome?: string
          numero_serie?: string | null
          observacoes?: string | null
          ocupantes_fixos?: number | null
          ocupantes_flutuantes?: number | null
          patrimonio?: string | null
          potencia?: number | null
          responsavel_tecnico?: string | null
          sala?: string | null
          sistema?: string | null
          status?: string
          tensao?: number | null
          tipo?: string | null
          tipo_atividade?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ativos_bloco_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos"
            referencedColumns: ["id"]
          },
        ]
      }
      blocos: {
        Row: {
          created_at: string | null
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          nome?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: []
      }
      chamados: {
        Row: {
          ambiente: string | null
          analisado_em: string | null
          analisado_por: string | null
          analisado_por_nome: string | null
          andar: string | null
          area: string | null
          ativo_codigo: string | null
          ativo_id: string | null
          ativo_nome: string | null
          bloco_id: string | null
          bloco_nome: string | null
          codigo: string
          created_at: string
          descricao_problema: string
          id: string
          justificativa_recusa: string | null
          os_id: string | null
          responsavel_id: string | null
          sala: string | null
          solicitante_id: string | null
          solicitante_nome: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ambiente?: string | null
          analisado_em?: string | null
          analisado_por?: string | null
          analisado_por_nome?: string | null
          andar?: string | null
          area?: string | null
          ativo_codigo?: string | null
          ativo_id?: string | null
          ativo_nome?: string | null
          bloco_id?: string | null
          bloco_nome?: string | null
          codigo?: string
          created_at?: string
          descricao_problema: string
          id?: string
          justificativa_recusa?: string | null
          os_id?: string | null
          responsavel_id?: string | null
          sala?: string | null
          solicitante_id?: string | null
          solicitante_nome?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ambiente?: string | null
          analisado_em?: string | null
          analisado_por?: string | null
          analisado_por_nome?: string | null
          andar?: string | null
          area?: string | null
          ativo_codigo?: string | null
          ativo_id?: string | null
          ativo_nome?: string | null
          bloco_id?: string | null
          bloco_nome?: string | null
          codigo?: string
          created_at?: string
          descricao_problema?: string
          id?: string
          justificativa_recusa?: string | null
          os_id?: string | null
          responsavel_id?: string | null
          sala?: string | null
          solicitante_id?: string | null
          solicitante_nome?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      checklist_os: {
        Row: {
          concluido: boolean
          concluido_em: string | null
          concluido_por: string | null
          created_at: string
          descricao: string
          id: string
          ordem: number
          os_id: string
        }
        Insert: {
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          descricao: string
          id?: string
          ordem?: number
          os_id: string
        }
        Update: {
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          descricao?: string
          id?: string
          ordem?: number
          os_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_os_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklist_os_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_template_items: {
        Row: {
          created_at: string
          descricao: string
          id: string
          ordem: number
          template_id: string
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          ordem?: number
          template_id: string
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          ordem?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "checklist_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          created_at: string
          id: string
          tipo_servico: string
          titulo: string
        }
        Insert: {
          created_at?: string
          id?: string
          tipo_servico: string
          titulo: string
        }
        Update: {
          created_at?: string
          id?: string
          tipo_servico?: string
          titulo?: string
        }
        Relationships: []
      }
      comentarios_os: {
        Row: {
          autor_id: string | null
          autor_nome: string
          created_at: string
          id: string
          os_id: string
          texto: string
        }
        Insert: {
          autor_id?: string | null
          autor_nome: string
          created_at?: string
          id?: string
          os_id: string
          texto: string
        }
        Update: {
          autor_id?: string | null
          autor_nome?: string
          created_at?: string
          id?: string
          os_id?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "comentarios_os_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          plan: string | null
          slug: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          plan?: string | null
          slug?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          plan?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      cronogramas: {
        Row: {
          criado_em: string
          data_fim: string | null
          data_inicio: string | null
          descricao: string | null
          id: string
          status: string
          titulo: string
        }
        Insert: {
          criado_em?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          status?: string
          titulo: string
        }
        Update: {
          criado_em?: string
          data_fim?: string | null
          data_inicio?: string | null
          descricao?: string | null
          id?: string
          status?: string
          titulo?: string
        }
        Relationships: []
      }
      gastos: {
        Row: {
          company_id: string | null
          created_at: string | null
          data_gasto: string | null
          descricao: string
          id: string
          os_id: string | null
          tipo_gasto: string | null
          tipo_gasto_id: string | null
          valor: number
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          data_gasto?: string | null
          descricao: string
          id?: string
          os_id?: string | null
          tipo_gasto?: string | null
          tipo_gasto_id?: string | null
          valor?: number
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          data_gasto?: string | null
          descricao?: string
          id?: string
          os_id?: string | null
          tipo_gasto?: string | null
          tipo_gasto_id?: string | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "gastos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gastos_tipo_gasto_id_fkey"
            columns: ["tipo_gasto_id"]
            isOneToOne: false
            referencedRelation: "tipos_gasto"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_ativos: {
        Row: {
          acao: string
          ativo_id: string
          created_at: string | null
          detalhes: string | null
          id: string
        }
        Insert: {
          acao: string
          ativo_id: string
          created_at?: string | null
          detalhes?: string | null
          id?: string
        }
        Update: {
          acao?: string
          ativo_id?: string
          created_at?: string | null
          detalhes?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_ativos_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_os: {
        Row: {
          acao: string
          company_id: string | null
          created_at: string | null
          detalhes: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          ordem_servico_id: string
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          acao: string
          company_id?: string | null
          created_at?: string | null
          detalhes?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          ordem_servico_id: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          acao?: string
          company_id?: string | null
          created_at?: string | null
          detalhes?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          ordem_servico_id?: string
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_os_ordem_servico_id_fkey"
            columns: ["ordem_servico_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_os_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      historico_preventiva: {
        Row: {
          data_geracao: string
          id: string
          observacao: string | null
          ordem_preventiva_id: string | null
          os_id: string | null
          preventiva_id: string
        }
        Insert: {
          data_geracao?: string
          id?: string
          observacao?: string | null
          ordem_preventiva_id?: string | null
          os_id?: string | null
          preventiva_id: string
        }
        Update: {
          data_geracao?: string
          id?: string
          observacao?: string | null
          ordem_preventiva_id?: string | null
          os_id?: string | null
          preventiva_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "historico_preventiva_ordem_preventiva_id_fkey"
            columns: ["ordem_preventiva_id"]
            isOneToOne: false
            referencedRelation: "ordens_preventivas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_preventiva_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "historico_preventiva_preventiva_id_fkey"
            columns: ["preventiva_id"]
            isOneToOne: false
            referencedRelation: "manutencao_preventiva"
            referencedColumns: ["id"]
          },
        ]
      }
      horas_atividade: {
        Row: {
          atividade_id: string | null
          atividade_op_id: string | null
          created_at: string
          data_registro: string
          descricao: string | null
          hora_fim: string | null
          hora_inicio: string | null
          id: string
          ordem_preventiva_id: string | null
          origem: string
          os_id: string | null
          tipo: string
          total_minutos: number
          updated_at: string
          user_id: string
        }
        Insert: {
          atividade_id?: string | null
          atividade_op_id?: string | null
          created_at?: string
          data_registro?: string
          descricao?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          ordem_preventiva_id?: string | null
          origem?: string
          os_id?: string | null
          tipo?: string
          total_minutos?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          atividade_id?: string | null
          atividade_op_id?: string | null
          created_at?: string
          data_registro?: string
          descricao?: string | null
          hora_fim?: string | null
          hora_inicio?: string | null
          id?: string
          ordem_preventiva_id?: string | null
          origem?: string
          os_id?: string | null
          tipo?: string
          total_minutos?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "horas_atividade_atividade_id_fkey"
            columns: ["atividade_id"]
            isOneToOne: false
            referencedRelation: "atividades_os"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horas_atividade_atividade_op_id_fkey"
            columns: ["atividade_op_id"]
            isOneToOne: false
            referencedRelation: "atividades_ordem_preventiva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horas_atividade_ordem_preventiva_id_fkey"
            columns: ["ordem_preventiva_id"]
            isOneToOne: false
            referencedRelation: "ordens_preventivas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horas_atividade_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "horas_atividade_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      manutencao_preventiva: {
        Row: {
          andar: string | null
          ativo: boolean
          ativo_id: string | null
          bloco_id: string | null
          created_at: string
          descricao: string | null
          frequencia: string
          id: string
          ordem_grandeza: string | null
          plano_id: string | null
          prioridade: string
          proxima_execucao: string
          qr_code_obrigatorio: boolean
          responsavel_id: string | null
          sala: string | null
          tipo_atividade: string | null
          tipo_medicao: string | null
          tipo_servico: string | null
          titulo: string
          ultima_execucao: string | null
          unidade_medicao: string | null
          updated_at: string
        }
        Insert: {
          andar?: string | null
          ativo?: boolean
          ativo_id?: string | null
          bloco_id?: string | null
          created_at?: string
          descricao?: string | null
          frequencia?: string
          id?: string
          ordem_grandeza?: string | null
          plano_id?: string | null
          prioridade?: string
          proxima_execucao: string
          qr_code_obrigatorio?: boolean
          responsavel_id?: string | null
          sala?: string | null
          tipo_atividade?: string | null
          tipo_medicao?: string | null
          tipo_servico?: string | null
          titulo: string
          ultima_execucao?: string | null
          unidade_medicao?: string | null
          updated_at?: string
        }
        Update: {
          andar?: string | null
          ativo?: boolean
          ativo_id?: string | null
          bloco_id?: string | null
          created_at?: string
          descricao?: string | null
          frequencia?: string
          id?: string
          ordem_grandeza?: string | null
          plano_id?: string | null
          prioridade?: string
          proxima_execucao?: string
          qr_code_obrigatorio?: boolean
          responsavel_id?: string | null
          sala?: string | null
          tipo_atividade?: string | null
          tipo_medicao?: string | null
          tipo_servico?: string | null
          titulo?: string
          ultima_execucao?: string | null
          unidade_medicao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manutencao_preventiva_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencao_preventiva_bloco_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencao_preventiva_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos_manutencao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencao_preventiva_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      materiais_os: {
        Row: {
          created_at: string | null
          custo_total_item: number | null
          custo_unitario: number
          data_compra: string | null
          fornecedor: string | null
          id: string
          nome_material: string
          os_id: string
          quantidade: number
          unidade: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          custo_total_item?: number | null
          custo_unitario?: number
          data_compra?: string | null
          fornecedor?: string | null
          id?: string
          nome_material: string
          os_id: string
          quantidade?: number
          unidade?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          custo_total_item?: number | null
          custo_unitario?: number
          data_compra?: string | null
          fornecedor?: string | null
          id?: string
          nome_material?: string
          os_id?: string
          quantidade?: number
          unidade?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "materiais_os_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_preventivas: {
        Row: {
          andar: string | null
          ativo_id: string | null
          bloco_id: string | null
          codigo_op: string
          company_id: string | null
          created_at: string
          criado_por: string | null
          cronograma_id: string | null
          data_inicio: string | null
          data_termino: string | null
          editado_em: string | null
          editado_por: string | null
          equipamentos: string | null
          finalizado_em: string | null
          finalizado_por: string | null
          id: string
          observacoes: string | null
          prazo: string | null
          preventiva_id: string | null
          prioridade: string
          qr_code_obrigatorio: boolean
          responsible_user_id: string | null
          sala: string | null
          status: string
          timer_paused_at: string | null
          timer_started_at: string | null
          timer_status: string
          timer_total_seconds: number
          timer_user_id: string | null
          tipo_servico: string | null
          titulo: string | null
          updated_at: string
        }
        Insert: {
          andar?: string | null
          ativo_id?: string | null
          bloco_id?: string | null
          codigo_op?: string
          company_id?: string | null
          created_at?: string
          criado_por?: string | null
          cronograma_id?: string | null
          data_inicio?: string | null
          data_termino?: string | null
          editado_em?: string | null
          editado_por?: string | null
          equipamentos?: string | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          id?: string
          observacoes?: string | null
          prazo?: string | null
          preventiva_id?: string | null
          prioridade?: string
          qr_code_obrigatorio?: boolean
          responsible_user_id?: string | null
          sala?: string | null
          status?: string
          timer_paused_at?: string | null
          timer_started_at?: string | null
          timer_status?: string
          timer_total_seconds?: number
          timer_user_id?: string | null
          tipo_servico?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Update: {
          andar?: string | null
          ativo_id?: string | null
          bloco_id?: string | null
          codigo_op?: string
          company_id?: string | null
          created_at?: string
          criado_por?: string | null
          cronograma_id?: string | null
          data_inicio?: string | null
          data_termino?: string | null
          editado_em?: string | null
          editado_por?: string | null
          equipamentos?: string | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          id?: string
          observacoes?: string | null
          prazo?: string | null
          preventiva_id?: string | null
          prioridade?: string
          qr_code_obrigatorio?: boolean
          responsible_user_id?: string | null
          sala?: string | null
          status?: string
          timer_paused_at?: string | null
          timer_started_at?: string | null
          timer_status?: string
          timer_total_seconds?: number
          timer_user_id?: string | null
          tipo_servico?: string | null
          titulo?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ordens_preventivas_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_preventivas_bloco_id_fkey"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_preventivas_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_preventivas_cronograma_id_fkey"
            columns: ["cronograma_id"]
            isOneToOne: false
            referencedRelation: "cronogramas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_preventivas_editado_por_fkey"
            columns: ["editado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_preventivas_finalizado_por_fkey"
            columns: ["finalizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_preventivas_preventiva_id_fkey"
            columns: ["preventiva_id"]
            isOneToOne: false
            referencedRelation: "manutencao_preventiva"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_preventivas_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ordens_servico: {
        Row: {
          andar: string | null
          ativo_ambiente: string | null
          ativo_area: string | null
          ativo_codigo: string | null
          ativo_id: string | null
          bloco_id: string | null
          codigo_os: string | null
          company_id: string | null
          created_at: string | null
          criado_por: string | null
          cronograma_id: string | null
          custo_total: number | null
          data_inicio: string | null
          data_termino: string | null
          descricao: string | null
          editado_em: string | null
          editado_por: string | null
          equipamentos: string | null
          finalizado_em: string | null
          finalizado_por: string | null
          id: string
          observacoes: string | null
          origem: string
          prazo: string | null
          prioridade: string
          responsible_user_id: string | null
          sala: string | null
          sla_prazo_limite: string | null
          status: string | null
          time_tracking_mode: string | null
          tipo_servico: string | null
          titulo: string | null
        }
        Insert: {
          andar?: string | null
          ativo_ambiente?: string | null
          ativo_area?: string | null
          ativo_codigo?: string | null
          ativo_id?: string | null
          bloco_id?: string | null
          codigo_os?: string | null
          company_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          cronograma_id?: string | null
          custo_total?: number | null
          data_inicio?: string | null
          data_termino?: string | null
          descricao?: string | null
          editado_em?: string | null
          editado_por?: string | null
          equipamentos?: string | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          id?: string
          observacoes?: string | null
          origem?: string
          prazo?: string | null
          prioridade?: string
          responsible_user_id?: string | null
          sala?: string | null
          sla_prazo_limite?: string | null
          status?: string | null
          time_tracking_mode?: string | null
          tipo_servico?: string | null
          titulo?: string | null
        }
        Update: {
          andar?: string | null
          ativo_ambiente?: string | null
          ativo_area?: string | null
          ativo_codigo?: string | null
          ativo_id?: string | null
          bloco_id?: string | null
          codigo_os?: string | null
          company_id?: string | null
          created_at?: string | null
          criado_por?: string | null
          cronograma_id?: string | null
          custo_total?: number | null
          data_inicio?: string | null
          data_termino?: string | null
          descricao?: string | null
          editado_em?: string | null
          editado_por?: string | null
          equipamentos?: string | null
          finalizado_em?: string | null
          finalizado_por?: string | null
          id?: string
          observacoes?: string | null
          origem?: string
          prazo?: string | null
          prioridade?: string
          responsible_user_id?: string | null
          sala?: string | null
          sla_prazo_limite?: string | null
          status?: string | null
          time_tracking_mode?: string | null
          tipo_servico?: string | null
          titulo?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_bloco"
            columns: ["bloco_id"]
            isOneToOne: false
            referencedRelation: "blocos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_criado_por_fkey"
            columns: ["criado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_cronograma_id_fkey"
            columns: ["cronograma_id"]
            isOneToOne: false
            referencedRelation: "cronogramas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_editado_por_fkey"
            columns: ["editado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_finalizado_por_fkey"
            columns: ["finalizado_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ordens_servico_responsible_user_id_fkey"
            columns: ["responsible_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      os_colaboradores: {
        Row: {
          created_at: string
          id: string
          os_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          os_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          os_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_colaboradores_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_colaboradores_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      os_notifications: {
        Row: {
          created_at: string
          id: string
          os_id: string
          read: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          os_id: string
          read?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          os_id?: string
          read?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_notifications_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      os_photos: {
        Row: {
          created_at: string
          id: string
          os_id: string
          photo_url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          os_id: string
          photo_url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          os_id?: string
          photo_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_photos_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_photos_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      os_responsaveis: {
        Row: {
          created_at: string
          id: string
          os_id: string
          profile_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          os_id: string
          profile_id: string
        }
        Update: {
          created_at?: string
          id?: string
          os_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_responsaveis_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_responsaveis_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      os_timers: {
        Row: {
          created_at: string
          id: string
          os_id: string
          paused_at: string | null
          started_at: string | null
          status: string
          total_seconds: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          os_id: string
          paused_at?: string | null
          started_at?: string | null
          status?: string
          total_seconds?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          os_id?: string
          paused_at?: string | null
          started_at?: string | null
          status?: string
          total_seconds?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "os_timers_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: true
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "os_timers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      perfis_acesso: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      permissoes_menu_perfil: {
        Row: {
          created_at: string
          id: string
          menu_key: string
          perfil_acesso_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_key: string
          perfil_acesso_id: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_key?: string
          perfil_acesso_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissoes_menu_perfil_perfil_acesso_id_fkey"
            columns: ["perfil_acesso_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      permissoes_perfil: {
        Row: {
          created_at: string
          id: string
          perfil_acesso_id: string
          permissao: string
        }
        Insert: {
          created_at?: string
          id?: string
          perfil_acesso_id: string
          permissao: string
        }
        Update: {
          created_at?: string
          id?: string
          perfil_acesso_id?: string
          permissao?: string
        }
        Relationships: [
          {
            foreignKeyName: "permissoes_perfil_perfil_acesso_id_fkey"
            columns: ["perfil_acesso_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_atividades: {
        Row: {
          concluido: boolean
          concluido_em: string | null
          concluido_por: string | null
          created_at: string
          descricao: string | null
          frequencia: string
          id: string
          nome: string
          ordem: number
          plano_id: string
          prioridade: string
          responsavel_id: string | null
          tipo_atividade: string | null
          tipo_medicao: string | null
          tipo_servico: string | null
          unidade_medicao: string | null
          updated_at: string
        }
        Insert: {
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          descricao?: string | null
          frequencia?: string
          id?: string
          nome: string
          ordem?: number
          plano_id: string
          prioridade?: string
          responsavel_id?: string | null
          tipo_atividade?: string | null
          tipo_medicao?: string | null
          tipo_servico?: string | null
          unidade_medicao?: string | null
          updated_at?: string
        }
        Update: {
          concluido?: boolean
          concluido_em?: string | null
          concluido_por?: string | null
          created_at?: string
          descricao?: string | null
          frequencia?: string
          id?: string
          nome?: string
          ordem?: number
          plano_id?: string
          prioridade?: string
          responsavel_id?: string | null
          tipo_atividade?: string | null
          tipo_medicao?: string | null
          tipo_servico?: string | null
          unidade_medicao?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_atividades_concluido_por_fkey"
            columns: ["concluido_por"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_atividades_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos_manutencao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_atividades_responsavel_id_fkey"
            columns: ["responsavel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_ativos: {
        Row: {
          ativo_id: string
          created_at: string
          id: string
          plano_id: string
        }
        Insert: {
          ativo_id: string
          created_at?: string
          id?: string
          plano_id: string
        }
        Update: {
          ativo_id?: string
          created_at?: string
          id?: string
          plano_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_ativos_ativo_id_fkey"
            columns: ["ativo_id"]
            isOneToOne: false
            referencedRelation: "ativos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_ativos_plano_id_fkey"
            columns: ["plano_id"]
            isOneToOne: false
            referencedRelation: "planos_manutencao"
            referencedColumns: ["id"]
          },
        ]
      }
      planos_manutencao: {
        Row: {
          andar: string | null
          ativo_id: string | null
          automatico: boolean
          bloco_id: string | null
          created_at: string
          data_inicio: string | null
          descricao: string | null
          frequencia: string
          id: string
          nome: string
          prioridade: string
          qr_code_obrigatorio: boolean
          responsavel_id: string | null
          sala: string | null
          status: string
          tipo_atividade: string | null
          tipo_medicao: string | null
          tipo_servico: string | null
          unidade_medicao: string | null
          updated_at: string
        }
        Insert: {
          andar?: string | null
          ativo_id?: string | null
          automatico?: boolean
          bloco_id?: string | null
          created_at?: string
          data_inicio?: string | null
          descricao?: string | null
          frequencia?: string
          id?: string
          nome: string
          prioridade?: string
          qr_code_obrigatorio?: boolean
          responsavel_id?: string | null
          sala?: string | null
          status?: string
          tipo_atividade?: string | null
          tipo_medicao?: string | null
          tipo_servico?: string | null
          unidade_medicao?: string | null
          updated_at?: string
        }
        Update: {
          andar?: string | null
          ativo_id?: string | null
          automatico?: boolean
          bloco_id?: string | null
          created_at?: string
          data_inicio?: string | null
          descricao?: string | null
          frequencia?: string
          id?: string
          nome?: string
          prioridade?: string
          qr_code_obrigatorio?: boolean
          responsavel_id?: string | null
          sala?: string | null
          status?: string
          tipo_atividade?: string | null
          tipo_medicao?: string | null
          tipo_servico?: string | null
          unidade_medicao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          cpf: string | null
          created_at: string
          email: string
          id: string
          job_title: string | null
          nome: string
          perfil_acesso_id: string | null
          scale_start_date: string | null
          scale_starts_working: boolean | null
          status: Database["public"]["Enums"]["app_user_status"]
          updated_at: string
          user_id: string | null
          work_days: string[] | null
          work_end: string | null
          work_schedule_type: string
          work_start: string | null
        }
        Insert: {
          cpf?: string | null
          created_at?: string
          email: string
          id?: string
          job_title?: string | null
          nome: string
          perfil_acesso_id?: string | null
          scale_start_date?: string | null
          scale_starts_working?: boolean | null
          status?: Database["public"]["Enums"]["app_user_status"]
          updated_at?: string
          user_id?: string | null
          work_days?: string[] | null
          work_end?: string | null
          work_schedule_type?: string
          work_start?: string | null
        }
        Update: {
          cpf?: string | null
          created_at?: string
          email?: string
          id?: string
          job_title?: string | null
          nome?: string
          perfil_acesso_id?: string | null
          scale_start_date?: string | null
          scale_starts_working?: boolean | null
          status?: Database["public"]["Enums"]["app_user_status"]
          updated_at?: string
          user_id?: string | null
          work_days?: string[] | null
          work_end?: string | null
          work_schedule_type?: string
          work_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_perfil_acesso_id_fkey"
            columns: ["perfil_acesso_id"]
            isOneToOne: false
            referencedRelation: "perfis_acesso"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_definicoes: {
        Row: {
          created_at: string
          descricao: string | null
          id: string
          prazo_horas: number
          prioridade: string
          tipo_servico: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          descricao?: string | null
          id?: string
          prazo_horas?: number
          prioridade?: string
          tipo_servico: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          descricao?: string | null
          id?: string
          prazo_horas?: number
          prioridade?: string
          tipo_servico?: string
          updated_at?: string
        }
        Relationships: []
      }
      tipos_atividade: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      tipos_gasto: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          company_id: string | null
          created_at: string | null
          full_name: string | null
          id: string
          role: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id: string
          role?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          full_name?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_roles_profile"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_my_role: {
        Args: never
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_permission: { Args: { _permission: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_br_holiday: { Args: { d: string }; Returns: boolean }
      is_business_day: { Args: { d: string }; Returns: boolean }
      next_business_day: { Args: { d: string }; Returns: string }
      next_business_day_from: { Args: { d: string }; Returns: string }
      next_chamado_codigo: { Args: never; Returns: string }
    }
    Enums: {
      app_role: "administrador" | "gestor" | "tecnico" | "visualizacao"
      app_user_status: "ativo" | "inativo"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["administrador", "gestor", "tecnico", "visualizacao"],
      app_user_status: ["ativo", "inativo"],
    },
  },
} as const
