CREATE TABLE digital_model_policies (
 tenant_id uuid PRIMARY KEY REFERENCES tenants(id), revision integer NOT NULL CHECK(revision>0),
 policy jsonb NOT NULL, updated_by uuid NOT NULL, updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(tenant_id,updated_by) REFERENCES memberships(tenant_id,id)
);
ALTER TABLE digital_model_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE digital_model_policies FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_boundary ON digital_model_policies USING(tenant_id::text=current_setting('app.tenant_id',true)) WITH CHECK(tenant_id::text=current_setting('app.tenant_id',true));
