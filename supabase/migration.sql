-- ============================================
-- Контроль магазина — Supabase миграция
-- Запустить в Supabase Dashboard → SQL Editor
-- ============================================

-- 1. Таблица записей чек-листа
CREATE TABLE IF NOT EXISTS checklist_entries (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  employee text NOT NULL,
  task_id text NOT NULL,
  task_name text NOT NULL,
  section text NOT NULL CHECK (section IN ('morning', 'daytime', 'evening')),
  status text NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  is_late boolean NOT NULL DEFAULT false,
  reason text,
  time_str text NOT NULL,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Уникальный ключ: одна задача на сотрудника в день
  UNIQUE (date, employee, task_id)
);

-- 2. Таблица журнала покупателей
CREATE TABLE IF NOT EXISTS checklist_customers_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  date date NOT NULL,
  employee text NOT NULL,
  event_time timestamptz NOT NULL DEFAULT now(),
  time_str text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Включаем Row Level Security
ALTER TABLE checklist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_customers_log ENABLE ROW LEVEL SECURITY;

-- 4. Политики доступа для anon-роли (внутренний инструмент, защита через PIN)
-- checklist_entries
CREATE POLICY "checklist_entries_select" ON checklist_entries
  FOR SELECT TO anon USING (true);

CREATE POLICY "checklist_entries_insert" ON checklist_entries
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "checklist_entries_update" ON checklist_entries
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "checklist_entries_delete" ON checklist_entries
  FOR DELETE TO anon USING (true);

-- checklist_customers_log
CREATE POLICY "checklist_customers_log_select" ON checklist_customers_log
  FOR SELECT TO anon USING (true);

CREATE POLICY "checklist_customers_log_insert" ON checklist_customers_log
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "checklist_customers_log_delete" ON checklist_customers_log
  FOR DELETE TO anon USING (true);

-- 5. Индексы для быстрых запросов по дате
CREATE INDEX IF NOT EXISTS idx_checklist_entries_date
  ON checklist_entries (date);

CREATE INDEX IF NOT EXISTS idx_checklist_entries_date_employee
  ON checklist_entries (date, employee);

CREATE INDEX IF NOT EXISTS idx_checklist_customers_log_date
  ON checklist_customers_log (date);
