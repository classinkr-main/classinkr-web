#!/bin/sh
# T9 동시 실행: after() 트리거와 매시 실행이 같은 leadgen 을 동시에 미러해도 1행만 생긴다
# 포트는 run-local.sh 가 넘긴다(일회용 클러스터). 어드민 저장소 이식 때 고정 포트 55733 을 변수로 바꿨다.
PQ="psql -h 127.0.0.1 -p ${LOCAL_PG_PORT:-55733} -U postgres -d t0 -v ON_ERROR_STOP=1 -qAt"
ROW="jsonb_build_array(jsonb_build_object('leadgen_id','1020','compass_lead_id',15,'received_at',now()-interval '2 minutes','name','동시','phone','01000009000','message',E'Meta Lead Ads\nleadgen_id=1020'))"
$PQ -c "begin; select out_action from public.meta_lead_mirror_apply($ROW); select pg_sleep(3); commit;" > a.out 2>&1 &
sleep 1
START=$(date +%s)
$PQ -c "select out_action from public.meta_lead_mirror_apply($ROW);" > b.out 2>&1
END=$(date +%s)
wait
echo "A: $(grep -v '^$' a.out | head -1)  B: $(cat b.out)  B_waited_s=$((END-START))"
echo "rows=$($PQ -c "select count(*) from public.leads where message like '%leadgen_id=1020%'")"
