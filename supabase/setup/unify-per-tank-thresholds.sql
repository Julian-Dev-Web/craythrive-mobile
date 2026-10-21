-- Keep both existing threshold tables and RLS intact. No data backfill.
-- The RPC remains SECURITY INVOKER; explicit owner checks and RLS both apply.
-- Single-tank changes never write the legacy account baseline.
begin;

CREATE OR REPLACE FUNCTION public.apply_tank_thresholds(p_tank_id uuid, p_patch jsonb, p_scope text DEFAULT 'single_tank'::text, p_source text DEFAULT 'manual'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE actor uuid=auth.uid(); target record; selected_row public.tank_threshold_settings; saved public.tank_threshold_settings;
 baseline jsonb; current_values jsonb; next_values jsonb; patch jsonb=p_patch; key text; canonical_key text; normalized_patch jsonb='{}';
 result jsonb='[]'; affected integer=0; changed integer=0;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required' USING ERRCODE='42501'; END IF;
 IF p_scope IS NULL OR p_source IS NULL OR p_scope NOT IN ('single_tank','all_tanks') OR p_source NOT IN ('manual','ai_recommendation') THEN RAISE EXCEPTION 'Invalid threshold operation'; END IF;
 -- Serialize this owner's changes, including first inserts and apply-all.
 PERFORM pg_advisory_xact_lock(hashtextextended('craythrive:thresholds:'||actor::text,0));
 PERFORM 1 FROM public.tanks WHERE id=p_tank_id AND user_id=actor FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Tank ownership required' USING ERRCODE='42501'; END IF;
 SELECT * INTO selected_row FROM public.tank_threshold_settings WHERE user_id=actor AND tank_id=p_tank_id FOR UPDATE;
 IF p_source='ai_recommendation' AND (patch IS NULL OR patch='{}'::jsonb) THEN
  IF selected_row.pending_ai_suggestion IS NULL THEN RAISE EXCEPTION 'No pending AI recommendation for this tank'; END IF;
  patch=public.craythrive_ai_threshold_patch(selected_row.pending_ai_suggestion);
 END IF;
 IF jsonb_typeof(patch) IS DISTINCT FROM 'object' OR patch='{}' THEN RAISE EXCEPTION 'No threshold changes supplied'; END IF;
 -- Explicit patches are supported for recommendation-only mobile clients.
 -- Legacy web clients may still accept a stored pending recommendation above.
 FOR key IN SELECT jsonb_object_keys(patch) LOOP
  canonical_key=CASE key
   WHEN 'temperature_min' THEN 'temperatureMin' WHEN 'temperature_max' THEN 'temperatureMax'
   WHEN 'ph_min' THEN 'phMin' WHEN 'ph_max' THEN 'phMax' WHEN 'turbidity_max' THEN 'turbidityMax'
   WHEN 'water_level_min' THEN 'waterLevelMin' WHEN 'ammonia_max' THEN 'ammoniaMax' ELSE key END;
  IF canonical_key NOT IN ('temperatureMin','temperatureMax','phMin','phMax','turbidityMax','waterLevelMin','ammoniaMax')
     OR jsonb_typeof(patch->key) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid threshold value: %',key; END IF;
  IF normalized_patch ? canonical_key AND normalized_patch->canonical_key IS DISTINCT FROM patch->key THEN
   RAISE EXCEPTION 'Conflicting threshold aliases: %',key;
  END IF;
  normalized_patch=normalized_patch||jsonb_build_object(canonical_key,patch->key);
 END LOOP;
 patch=normalized_patch;
 SELECT to_jsonb(s) INTO baseline FROM public.threshold_settings s WHERE user_id=actor;
 PERFORM set_config('craythrive.threshold_source',p_source,true);
 PERFORM set_config('craythrive.threshold_scope',p_scope,true);
 FOR target IN SELECT id FROM public.tanks WHERE user_id=actor AND (p_scope='all_tanks' OR id=p_tank_id) ORDER BY id FOR UPDATE LOOP
  SELECT * INTO saved FROM public.tank_threshold_settings WHERE user_id=actor AND tank_id=target.id FOR UPDATE;
  current_values=public.craythrive_threshold_values(CASE WHEN saved.id IS NULL THEN baseline ELSE to_jsonb(saved) END);
  next_values=current_values||patch;
  IF (next_values->>'temperatureMin')::numeric NOT BETWEEN 10 AND 40 OR (next_values->>'temperatureMax')::numeric NOT BETWEEN 10 AND 40
   OR (next_values->>'temperatureMin')::numeric >= (next_values->>'temperatureMax')::numeric
   OR (next_values->>'phMin')::numeric < 0 OR (next_values->>'phMax')::numeric > 14
   OR (next_values->>'phMin')::numeric >= (next_values->>'phMax')::numeric
   OR (next_values->>'turbidityMax')::numeric NOT BETWEEN 0 AND 5
   OR (next_values->>'waterLevelMin')::numeric NOT BETWEEN 0 AND 20
   OR (next_values->>'ammoniaMax')::numeric NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'Threshold values are outside supported limits'; END IF;
  IF next_values IS DISTINCT FROM current_values THEN changed=changed+1; END IF;
  INSERT INTO public.tank_threshold_settings(user_id,tank_id,thresholds,temperature_min,temperature_max,ph_min,ph_max,turbidity_max,water_level_min,ammonia_max)
  VALUES(actor,target.id,next_values,(next_values->>'temperatureMin')::numeric,(next_values->>'temperatureMax')::numeric,
   (next_values->>'phMin')::numeric,(next_values->>'phMax')::numeric,(next_values->>'turbidityMax')::numeric,
   (next_values->>'waterLevelMin')::numeric,(next_values->>'ammoniaMax')::numeric)
  ON CONFLICT (user_id,tank_id) DO UPDATE SET thresholds=excluded.thresholds,temperature_min=excluded.temperature_min,
   temperature_max=excluded.temperature_max,ph_min=excluded.ph_min,ph_max=excluded.ph_max,turbidity_max=excluded.turbidity_max,
   water_level_min=excluded.water_level_min,ammonia_max=excluded.ammonia_max,updated_at=now()
  RETURNING * INTO saved;
  result=result||jsonb_build_array(to_jsonb(saved)); affected=affected+1;
 END LOOP;
 -- Synchronize the account-wide baseline only for an explicit Apply All.
 -- Do this AFTER tank writes so insert audits compare with the old fallback.
 -- Preserve legacy identity, creation time and pending metadata; bump the
 -- update timestamp only when effective legacy values actually change.
 IF p_scope='all_tanks' THEN
  -- Mirror only the accepted patch, preserving unrelated legacy values.
  next_values=public.craythrive_threshold_values(baseline)||patch;
  IF (next_values->>'temperatureMin')::numeric NOT BETWEEN 10 AND 40 OR (next_values->>'temperatureMax')::numeric NOT BETWEEN 10 AND 40
   OR (next_values->>'temperatureMin')::numeric >= (next_values->>'temperatureMax')::numeric
   OR (next_values->>'phMin')::numeric < 0 OR (next_values->>'phMax')::numeric > 14
   OR (next_values->>'phMin')::numeric >= (next_values->>'phMax')::numeric
   OR (next_values->>'turbidityMax')::numeric NOT BETWEEN 0 AND 5
   OR (next_values->>'waterLevelMin')::numeric NOT BETWEEN 0 AND 20
   OR (next_values->>'ammoniaMax')::numeric NOT BETWEEN 0 AND 5 THEN RAISE EXCEPTION 'Threshold values are outside supported limits'; END IF;
  INSERT INTO public.threshold_settings(user_id,thresholds,temperature_min,temperature_max,ph_min,ph_max,turbidity_max,water_level_min,ammonia_max)
  VALUES(actor,next_values,(next_values->>'temperatureMin')::numeric,(next_values->>'temperatureMax')::numeric,
   (next_values->>'phMin')::numeric,(next_values->>'phMax')::numeric,(next_values->>'turbidityMax')::numeric,
   (next_values->>'waterLevelMin')::numeric,(next_values->>'ammoniaMax')::numeric)
  ON CONFLICT (user_id) DO UPDATE SET thresholds=threshold_settings.thresholds||excluded.thresholds,temperature_min=excluded.temperature_min,
   temperature_max=excluded.temperature_max,ph_min=excluded.ph_min,ph_max=excluded.ph_max,turbidity_max=excluded.turbidity_max,
   water_level_min=excluded.water_level_min,ammonia_max=excluded.ammonia_max,
   updated_at=CASE WHEN public.craythrive_threshold_values(to_jsonb(threshold_settings)) IS DISTINCT FROM next_values
    THEN now() ELSE threshold_settings.updated_at END;
 END IF;
 IF p_source='ai_recommendation' THEN
  UPDATE public.tank_threshold_settings SET pending_ai_suggestion=NULL,pending_ai_suggested_at=NULL WHERE user_id=actor AND tank_id=p_tank_id;
 END IF;
 PERFORM set_config('craythrive.threshold_source','',true);
 PERFORM set_config('craythrive.threshold_scope','',true);
 RETURN jsonb_build_object('affected',affected,'changed',changed,'rows',result);
END $function$
;

CREATE OR REPLACE FUNCTION public.craythrive_audit_threshold_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE before_values jsonb; after_values jsonb; baseline jsonb; changes text[]='{}'; item record;
 source_value text; scope_value text;
BEGIN
 IF NEW.tank_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.tanks WHERE id=NEW.tank_id AND user_id=NEW.user_id) THEN
  RAISE EXCEPTION 'Tank ownership required' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' THEN
  IF OLD.user_id IS DISTINCT FROM NEW.user_id OR OLD.tank_id IS DISTINCT FROM NEW.tank_id THEN
   RAISE EXCEPTION 'Threshold identity cannot be changed' USING ERRCODE='42501';
  END IF;
  before_values=public.craythrive_threshold_values(to_jsonb(OLD));
 ELSE
  SELECT to_jsonb(s) INTO baseline FROM public.threshold_settings s WHERE user_id=NEW.user_id;
  before_values=public.craythrive_threshold_values(baseline);
 END IF;
 -- Legacy writes have no tank attribution. Administrative/backfill writes with
 -- no authenticated actor are not user actions and must not fabricate activity.
 IF NEW.tank_id IS NULL OR auth.uid() IS NULL THEN RETURN NEW; END IF;
 after_values=public.craythrive_threshold_values(to_jsonb(NEW));
 IF before_values=after_values THEN RETURN NEW; END IF;
 source_value=CASE WHEN current_setting('craythrive.threshold_source',true)='ai_recommendation' THEN 'ai_recommendation' ELSE 'manual' END;
 scope_value=CASE WHEN current_setting('craythrive.threshold_scope',true)='all_tanks' THEN 'all_tanks' ELSE 'single_tank' END;
 FOR item IN SELECT * FROM (VALUES
  ('temperatureMin','Temperature Minimum',' °C'),('temperatureMax','Temperature Maximum',' °C'),
  ('phMin','pH Minimum',''),('phMax','pH Maximum',''),('turbidityMax','Water Clarity Minimum',' V'),
  ('waterLevelMin','Water Level Minimum',' cm'),('ammoniaMax','Ammonia Maximum',' mg/L')
 ) AS v(key,label,unit) LOOP
  IF before_values->item.key IS DISTINCT FROM after_values->item.key THEN
   changes=array_append(changes,item.label||': '||(before_values->>item.key)||item.unit||' -> '||(after_values->>item.key)||item.unit);
  END IF;
 END LOOP;
 INSERT INTO public.control_logs(user_id,tank_id,action_type,action_status,notes,metadata)
 VALUES(NEW.user_id,NEW.tank_id,'threshold_updated','updated',array_to_string(changes,E'\n')
  ||CASE WHEN source_value='ai_recommendation' THEN E'\nAI recommendation accepted by user.' ELSE E'\nManual' END
  ||CASE WHEN scope_value='all_tanks' THEN E'\nApplied to all tanks.' ELSE '' END,
  jsonb_build_object('source',source_value,'scope',scope_value,'actor_user_id',auth.uid(),
   'old_values',before_values,'new_values',after_values));
 RETURN NEW;
END $function$
;

commit;
