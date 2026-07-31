-- Make the newly deployed attendance RPC signatures immediately visible to PostgREST.
notify pgrst, 'reload schema';
